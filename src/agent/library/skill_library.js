import { cosineSimilarity } from '../../utils/math.js';
import { getSkillDocs } from './index.js';
import { wordOverlapScore } from '../../utils/text.js';
import fs from 'fs';
import path from 'path';

export class SkillLibrary {
    constructor(agent, vectorStore) {
        this.agent = agent;
        this.vectorStore = vectorStore;
        this.embedding_model = null; // Deprecated, use vectorStore
        this.skill_docs_embeddings = {};
        this.skill_docs = null;
        this.always_show_skills = ['skills.placeBlock', 'skills.wait', 'skills.breakBlockAt']
        this.customSkillsPath = './skills/custom'; // Added customSkillsPath
        this.customSkills = {}; // Added customSkills
    }
    async initSkillLibrary() {
        const skillDocs = getSkillDocs();

        // Load custom skills from disk
        try {
            if (fs.existsSync(this.customSkillsPath)) {
                const files = fs.readdirSync(this.customSkillsPath);
                for (const file of files) {
                    if (file.endsWith('.js')) {
                        const name = file.replace('.js', '');
                        const code = fs.readFileSync(path.join(this.customSkillsPath, file), 'utf8');
                        this.customSkills[name] = code;

                        // Extract description for docs
                        let description = '';
                        const docMatch = code.match(/\/\*\*([\s\S]*?)\*\//);
                        if (docMatch) {
                            description = docMatch[1].trim();
                        }

                        skillDocs.push(`custom.${name}\n/**\n${description}\n**/`);
                        console.log(`[SkillLibrary] Loaded custom skill: ${name}`);
                    }
                }
            }
        } catch (e) {
            console.error('[SkillLibrary] Failed to load custom skills:', e);
        }

        this.skill_docs = skillDocs;

        // Embedding Logic
        if (this.vectorStore) {
            try {
                const embeddingPromises = skillDocs.map((doc) => {
                    return (async () => {
                        let func_name_desc = doc.split('\n').slice(0, 2).join('');
                        // Check if we already have it (optimization)
                        if (!this.skill_docs_embeddings[doc]) {
                            try {
                                this.skill_docs_embeddings[doc] = await this.vectorStore.getEmbedding(func_name_desc);
                            } catch (e) { console.warn('Single embedding failed', e); }
                        }
                    })();
                });
                await Promise.all(embeddingPromises);
            } catch (error) {
                console.warn('Error with embedding model, using word-overlap instead.');
            }

            this.always_show_skills_docs = {};
            for (const skillName of this.always_show_skills) {
                this.always_show_skills_docs[skillName] = this.skill_docs.find(doc => doc.includes(skillName));
            }
        }
    }

    getCustomSkills() {
        return this.customSkills;
    }

    async addSkill(name, code, description, tags = []) {
        console.log(`[SkillLibrary] Saving new skill: ${name}`);

        // 1. Format code with JSDoc
        const fileContent = `
/**
 * ${description}
 * Tags: ${tags.join(', ')}
 */
export async function ${name}(bot, ...args) {
    ${code}
}
`;
        // 2. Write to disk
        // Strip async function wrapper if user provided only body? 
        // Assuming 'code' passed here is just the body or the full function?
        // Usually CodeEngine passes the full function source or just body.
        // Let's assume CodeEngine passes the full function logic.
        // If 'code' contains "export async function", use it directly.

        let finalCode = code;
        if (!code.includes('export async function')) {
            // It's likely just the body or a function decl
            finalCode = fileContent; // Helper to cleanup in CodeEngine might be better
        }

        try {
            fs.writeFileSync(path.join(this.customSkillsPath, `${name}.js`), finalCode);
            this.customSkills[name] = finalCode;

            // Update Docs
            const docEntry = `custom.${name}\n/**\n${description}\n**/`;
            this.skill_docs.push(docEntry);

            // Update Embeddings
            if (this.vectorStore) {
                try {
                    const embedding = await this.vectorStore.getEmbedding(`${name}\n${description}`);
                    this.skill_docs_embeddings[docEntry] = embedding;
                } catch (err) {
                    console.warn(`Failed to embed new skill ${name}:`, err);
                }
            }

            return true;
        } catch (e) {
            console.error(`[SkillLibrary] Failed to save skill ${name}:`, e);
            return false;
        }
    }

    async search(query) {
        // Simple search that uses getRelevantSkillDocs logic but returns the best match
        const docsStr = await this.getRelevantSkillDocs(query, 1);
        if (!docsStr) return null;

        // Extract the skill name from the docs string if possible, or return null
        // Format: #### RELEVANT CODE DOCS ###\n... \n### skills.name\n...
        // This is a rough heuristic. Ideally 'search' implies looking up a specific learned skill by intent.

        // For now, let's return null to force generation until we implement a robust skill retrieval.
        // Or better: check if we have an exact match in our loaded skills
        // return this.skill_docs.find(doc => doc.includes(query));
        return null;
    }

    async getAllSkillDocs() {
        return this.skill_docs;
    }

    async getRelevantSkillDocs(message, select_num) {
        if (!message) // use filler message if none is provided
            message = '(no message)';
        let skill_doc_similarities = [];

        if (select_num === -1) {
            skill_doc_similarities = Object.keys(this.skill_docs_embeddings)
                .map(doc_key => ({
                    doc_key,
                    similarity_score: 0
                }));
        }
        else {
            let latest_message_embedding = null;
            if (this.vectorStore) {
                try {
                    latest_message_embedding = await this.vectorStore.getEmbedding(message);
                } catch (e) {
                    console.warn('Embedding failed in getRelevantSkillDocs, falling back to word overlap.');
                }
            }

            if (!latest_message_embedding) {
                // Fallback if embedding failed or embedding_model was null
                skill_doc_similarities = Object.keys(this.skill_docs_embeddings)
                    .map(doc_key => ({
                        doc_key,
                        similarity_score: wordOverlapScore(message, doc_key) // Use doc_key directly for word overlap
                    }))
                    .sort((a, b) => b.similarity_score - a.similarity_score);
            } else {
                skill_doc_similarities = Object.keys(this.skill_docs_embeddings)
                    .map(doc_key => ({
                        doc_key,
                        similarity_score: cosineSimilarity(latest_message_embedding, this.skill_docs_embeddings[doc_key])
                    }))
                    .sort((a, b) => b.similarity_score - a.similarity_score);
            }
        }

        let length = skill_doc_similarities.length;
        if (select_num === -1 || select_num > length) {
            select_num = length;
        }
        // Get initial docs from similarity scores
        let selected_docs = new Set(skill_doc_similarities.slice(0, select_num).map(doc => doc.doc_key));

        // Add always show docs
        Object.values(this.always_show_skills_docs || {}).forEach(doc => {
            if (doc) {
                selected_docs.add(doc);
            }
        });

        let relevant_skill_docs = '#### RELEVANT CODE DOCS ###\nThe following functions are available to use:\n';
        relevant_skill_docs += Array.from(selected_docs).join('\n### ');

        console.log('Selected skill docs:', Array.from(selected_docs).map(doc => {
            const first_line_break = doc.indexOf('\n');
            return first_line_break > 0 ? doc.substring(0, first_line_break) : doc;
        }));
        return relevant_skill_docs;
    }
}
