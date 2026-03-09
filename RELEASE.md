# Release Guide

## Steps to Release a New Version

1. Update `CHANGELOG.md`:
   - Add version entry: `## [X.Y.Z] - YYYY-MM-DD` with changes

2. Update version in `package.json`:
   ```sh
   # Edit package.json to set "version": "X.Y.Z"
   npm install  # sync package-lock.json
   ```

3. Commit and tag:
   ```sh
   git add CHANGELOG.md package.json package-lock.json
   git commit -m "chore: update version to vX.Y.Z"
   git tag vX.Y.Z
   git push origin main --tags
   ```

4. Publish the extension:
   ```sh
   npx @vscode/vsce publish
   ```
   Or package for manual upload:
   ```sh
   npx @vscode/vsce package
   # Output: github-copilot-usage-X.Y.Z.vsix
   ```

5. Create a GitHub Release (once a remote is configured):
   ```sh
   gh release create vX.Y.Z --title "vX.Y.Z" --notes-file <(grep -A50 "## \[X.Y.Z\]" CHANGELOG.md | sed -n '1,/^## \[/{ /^## \[X/d; /^## \[/q; p }')
   ```
