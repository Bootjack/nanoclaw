# Dependency Check Scripts

This directory contains scripts that verify and fix host dependencies during auto-deployment.

## How It Works

Each script in this directory is automatically run during deployment. Scripts should:

1. **Check** if a dependency is present and working
2. **Attempt to fix** the dependency if possible
3. **Return appropriate exit codes**:
   - `0`: Dependency is satisfied (or was successfully fixed)
   - `1`: Dependency check failed (will log warning but not fail deployment)
   - `2`: Dependency not needed in this environment (e.g., headless systems)

## Adding New Checks

To add a new dependency check:

1. Create a new script in this directory (e.g., `gpu-drivers.sh`)
2. Make it executable: `chmod +x scripts/dependency-checks/gpu-drivers.sh`
3. Follow the exit code convention above
4. The auto-deployment system will automatically discover and run it

## Existing Checks

- **audio-server.sh**: Verifies PulseAudio or PipeWire is available for browser audio support

## Exit Code Handling

- Exit code `0`: Check passed, logs success
- Exit code `2`: Not applicable (e.g., headless environment), logs info message
- Exit code `1` or other: Check failed, logs warning but continues deployment

All dependency checks are **non-critical** by design - they won't prevent deployment from completing.
