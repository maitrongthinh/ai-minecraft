
import * as acorn from 'acorn';
import * as walk from 'acorn-walk';

/**
 * CodeSanitizer.js
 * 
 * Responsibilities:
 * 1. Parse JS code to AST
 * 2. Traverse and identify loops (while, for, do-while)
 * 3. Inject timeout guards to prevent infinite loops (DoS protection)
 */
export class CodeSanitizer {
    static sanitize(code, timeoutMs = 5000) {
        if (!code) return code;

        // 1. Parse AST
        let ast;
        try {
            ast = acorn.parse(code, { ecmaVersion: 2020 });
        } catch (e) {
            // If parse fails, we can't sanitize safely. 
            // However, CodeEngine might handle syntax errors later.
            // For now, return as is (CodeEngine will catch syntax error)
            return code;
        }

        // 2. Identify Injection Points
        // We perform a reverse traversal or collect insertions to avoid offset drift
        const insertions = [];

        walk.simple(ast, {
            WhileStatement(node) {
                CodeSanitizer._addInjection(node.body, insertions);
            },
            DoWhileStatement(node) {
                CodeSanitizer._addInjection(node.body, insertions);
            },
            ForStatement(node) {
                CodeSanitizer._addInjection(node.body, insertions);
            },
            ForOfStatement(node) { // for (const x of y)
                CodeSanitizer._addInjection(node.body, insertions);
            },
            ForInStatement(node) { // for (const x in y)
                CodeSanitizer._addInjection(node.body, insertions);
            }
        });

        // 3. Apply Injections (Reverse order to preserve offsets)
        insertions.sort((a, b) => b.index - a.index);

        let sanitized = code;
        const timeoutCheck = ` if (Date.now() - _start > ${timeoutMs}) throw new Error("Execution Timeout"); `;

        for (const ins of insertions) {
            if (ins.needBraces) {
                // Convert single statement to block:  while(1) do() -> while(1) { check; do(); }
                const before = sanitized.slice(0, ins.start);
                const body = sanitized.slice(ins.start, ins.end);
                const after = sanitized.slice(ins.end);
                sanitized = `${before}{${timeoutCheck}${body}}${after}`;
            } else {
                // Already a block: while(1) { do() } -> while(1) { check; do() }
                const before = sanitized.slice(0, ins.index);
                const after = sanitized.slice(ins.index);
                sanitized = `${before}${timeoutCheck}${after}`;
            }
        }

        // 4. Wrap with Start Timer
        return `const _start = Date.now();\n${sanitized}`;
    }

    static _addInjection(bodyNode, insertions) {
        if (bodyNode.type === 'BlockStatement') {
            // Insert after '{'
            // bodyNode.start includes '{' usually? acorn ranges are exact.
            // BlockStatement: { body: [...] }
            // We want to insert right after the opening brace.
            // acorn BlockStatement range includes braces.
            // We can assume start + 1 is safe? 
            // Better: Check source? We don't have source in the node easily unless we pass it.
            // Assumption: BlockStatement starts with '{'.
            insertions.push({ index: bodyNode.start + 1, needBraces: false });
        } else {
            // Single statement body: while(true) doSomething();
            // We need to wrap it.
            insertions.push({
                index: bodyNode.start, // logic handled in apply 
                start: bodyNode.start,
                end: bodyNode.end,
                needBraces: true
            });
        }
    }
}
