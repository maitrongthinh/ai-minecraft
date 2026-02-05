# Changelog

## [2.0.0] - 2026-02-05
### Added
- **DualBrain Architecture**: Split AI into Strategy (Planning) and Reflex (Fast) layers.
- **StateStack**: Priority-based state machine replacing flat `modes.js`.
- **Active Vision**: Systematic environment scanning every 10 seconds.
- **SkillOptimizer**: Self-improving code module using MiniMax-M2.
- **Cognee Bridge**: Long-term memory integration with Vector DB.

### Changed
- Refactored `agent.js` to use Event-Driven update loop.
- Optimized `start_safe.js` to handle zombie processes on Windows (`taskkill /F /T`).
- Hardened `Arbiter` for command safety.

### Fixed
- **Ghost Code**: Connected `StateStack` to legacy modes via Adapter pattern.
- **Passive Vision**: Vision system now actively scans without prompts.
- **Initialization**: Fixed race conditions in `CogneeMemoryBridge`.

## [1.5.0] - 2026-01-30
### Added
- Initial `StrategyPlanner`.
- `HumanManager` for social trust scores.

## [1.0.0] - 2026-01-01
- Initial Release of Antigravity Bot.
