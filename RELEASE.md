# Release Guide

## Steps to Release a New Version

1. Update `CHANGELOG.md`:
   - Add version entry: `## [X.Y.Z] - YYYY-MM-DD` with changes

2. Update version in `package.json`:
   ```sh
   # Edit package.json to set "version": "X.Y.Z"
   npm install  # sync package-lock.json
   ```

3. Commit and push:
   ```sh
   git add CHANGELOG.md package.json package-lock.json
   git commit -m "chore: update version to vX.Y.Z"
   git push origin main
   ```

4. Run the release workflow:
   ```sh
   gh workflow run release.yml
   ```
   This will run tests, package the extension as `.vsix`, and create a GitHub Release with the file attached.

5. Verify the release was created successfully:
   ```sh
   gh release view vX.Y.Z
   ```

6. Update the release notes on GitHub to match `CHANGELOG.md`:
   ```sh
   gh release edit vX.Y.Z --notes "## What's Changed
   - Change 1
   - Change 2

   **Full Changelog**: https://github.com/euxx/github-copilot-usage/compare/vPREV...vX.Y.Z"
   ```
