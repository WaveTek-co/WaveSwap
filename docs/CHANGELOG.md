# Changelog

All notable changes to the WaveStake program will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Planned for v1.2 (Mainnet)
- [ ] Security audit completion
- [ ] PDA-based pool vault implementation
- [ ] Pause/emergency stop functionality
- [ ] Multi-sig upgrade authority
- [ ] Enhanced monitoring
- [ ] Performance optimizations

## [1.1.0] - 2025-12-30

### Added
- Comprehensive documentation suite
- Account size validation
- Proper version tracking in code
- Deployment procedures
- Operations guide
- Technical architecture documentation

### Changed
- **CRITICAL**: Fixed account size calculation (included bump field)
- **CRITICAL**: Removed `init_if_needed` to prevent size mismatches
- Updated program ID (clean deployment to avoid corrupted accounts)
- Improved code comments and documentation
- Added deprecation warnings for v1.0

### Fixed
- User accounts now consistently created with correct 52-byte size
- SOL to lamports conversion (1e9 instead of 1e6)
- Quick stake buttons (25%, 50%, Max) now work correctly
- User account deserialization now properly reads all fields
- LST symbols display correctly (waveSOL, sWAVE, etc.)

### Removed
- `init_if_needed` feature (too risky for production)
- Unused imports (`TokenAccount`, `token_2022`, `system_program`)

### Deprecated
- v1.0 program (`5fJF7FV29wZG6Azg1GLesEQVnGFdWHkFiauBaLCkqFZJ`) - Do NOT use
- Old user accounts with 218-byte size

### Security
- Documented all security considerations
- Added emergency procedures
- Created upgrade/migration guides
- Documented lessons learned from v1.0

## [1.0.0] - 2025-12-28

### Added
- Initial release of WaveStake program
- Support for SOL, WAVE, GOLD, WEALTH, ZEC staking
- Flexible staking (no lock)
- Locked staking (30-day lock with bonus)
- Reward distribution system
- User account tracking
- Pool management
- Basic client-side UI

### Known Issues
- **CRITICAL**: User accounts could have incorrect sizes (218 vs 52 bytes)
- Could not stake after account creation
- No proper account initialization validation
- Missing `init_if_needed` safety checks
- No upgrade procedures documented
- No operations documentation

### Deprecated
- **DO NOT USE** - This version has critical bugs that prevent proper operation

---

## Version History Summary

| Version | Date | Status | Program ID | Notes |
|---------|------|--------|------------|-------|
| 1.0.0 | 2025-12-28 | ❌ Deprecated | 5fJF7FV...vzUdqEz | Critical account size bugs |
| 1.1.0 | 2025-12-30 | ✅ Current (Devnet) | 6Gah3kZ...MGS5CoZ | All critical bugs fixed |
| 1.2.0 | TBD | 🚧 Planned (Mainnet) | TBD | Pending audit, production-ready |

## Breaking Changes

### v1.0 → v1.1
- **Program ID Changed**: Must update client configuration
- **Account Structure**: User accounts now always 52 bytes (was variable)
- **Pool Incompatibility**: Old pools from v1.0 cannot be used with v1.1
- **Migration Required**: Users must unstake from v1.0 before v1.1 deployment

### Future v1.1 → v1.2
- Pool authority may change from external wallet to PDA
- May require pool migration
- Will provide migration tools

## Migration Guides

### v1.0 → v1.1
Since v1.1 uses a completely new program ID:
1. Deploy new program (v1.1)
2. Create new pools
3. Users must unstake from v1.0 pools (if possible)
4. Users stake in v1.1 pools
5. Deprecate v1.0 program

**Note**: v1.0 accounts are corrupted and cannot be properly migrated.

### v1.1 → v1.2 (Future)
Migration will be provided if needed. Will maintain backward compatibility where possible.

## Bug Fixes

### Critical (v1.0 → v1.1)
- **Account Size**: Fixed calculation to include bump field
- **Staking Failure**: Removed `init_if_needed` that caused failures
- **SOL Conversion**: Fixed 1e6 → 1e9 for lamports
- **Button Functions**: Fixed 25%/50%/Max buttons

### Important (v1.0 → v1.1)
- **Account Deserialization**: Now reads all fields correctly
- **LST Display**: Shows correct symbols (waveSOL, sWAVE, etc.)
- **Transfer Logic**: Proper handling for native SOL vs SPL tokens

## Performance Improvements

### v1.1
- Optimized account validation
- Reduced compute unit usage
- Better error messages for debugging
- Improved transaction reliability

## Documentation Improvements

### v1.1
- Added 4 comprehensive documents
- Created deployment checklists
- Documented all security procedures
- Added troubleshooting guides
- Created post-mortem of v1.0 issues

## Contributors

- [@vivek] - Lead Developer
- WaveTek Team - Architecture and Review

## Support

For questions about these changes:
- GitHub Issues: [repository-url]
- Discord: [discord-invite]
- Email: support@wavetek.io

---

**Note**: This changelog follows semantic versioning. Any breaking change will increment the MINOR version (1.x.0), bug fixes increment PATCH (1.1.x), and new features increment MINOR (1.x.0).
