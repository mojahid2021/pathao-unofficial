# Publishing Guide: pathao-unofficial

This guide walks you through publishing the `pathao-unofficial` package to GitHub and NPM.

## Prerequisites

1. **GitHub Account** - https://github.com
2. **NPM Account** - https://npmjs.com (optional, but required for publishing)
3. **Git installed** - `git --version` should work
4. **Node.js >= 18** - `node --version`
5. **NPM CLI** - `npm --version`

## Step 1: Create GitHub Repository

### Option A: Using GitHub Web Interface

1. Go to https://github.com/new
2. Fill in repository details:
   - **Repository name**: `pathao-unofficial`
   - **Description**: `Unofficial Pathao delivery API client library. OAuth token management, pricing, orders, and location synchronization.`
   - **Visibility**: Public (for open-source)
   - **Initialize repository**: Uncheck (we already have local repo)
3. Click **Create repository**
4. Copy the HTTPS URL (e.g., `https://github.com/yourusername/pathao-unofficial.git`)

### Option B: Using GitHub CLI

```bash
# Install GitHub CLI: https://cli.github.com
gh repo create pathao-unofficial \
  --public \
  --source=. \
  --remote=origin \
  --push \
  --description "Unofficial Pathao delivery API client library"
```

## Step 2: Connect Local Repository to GitHub

If using Option A above, configure the remote:

```bash
cd /root/pathao-unofficial

# Add the GitHub repository as remote
git remote add origin https://github.com/mojahid2021/pathao-unofficial.git

# Verify remote
git remote -v
# Output should show:
# origin  https://github.com/mojahid2021/pathao-unofficial.git (fetch)
# origin  https://github.com/mojahid2021/pathao-unofficial.git (push)
```

## Step 3: Push to GitHub

```bash
# Set main as default branch
git branch -M main

# Push all commits and tags
git push -u origin main

# Verify on GitHub
# Visit: https://github.com/mojahid2021/pathao-unofficial
```

## Step 4: Update package.json with Your GitHub URL

Edit `package.json` and replace placeholders:

```bash
# Replace yourusername with your actual GitHub username
sed -i 's|mojahid2021|mojahid2021|g' package.json

# Or manually edit package.json:
# - "url": "https://github.com/mojahid2021/pathao-unofficial.git"
# - "homepage": "https://github.com/mojahid2021/pathao-unofficial"
# - "author": "Md Mojahid <aammojahid@gmail.com>"
```

## Step 5: Test Everything Before Publishing

```bash
# Run tests (required by prepublishOnly)
npm test

# Verify package locally
npm pack

# This creates pathao-unofficial-0.1.0.tgz and shows what will be published
```

## Step 6: Set Up NPM Account (First Time Only)

```bash
# Create account at https://npmjs.com if you don't have one

# Log in to NPM
npm login

# Enter your NPM credentials:
# - Username
# - Password
# - Email (verified on https://npmjs.com)
# - One-time password (if 2FA enabled)

# Verify login
npm whoami
# Output: your-npm-username
```

## Step 7: Publish to NPM

### First Publishing (v0.1.0)

```bash
# Commit package.json changes if modified
git add package.json
git commit -m "chore: update package.json with author and npm info"
git push origin main

# Publish to NPM
npm publish

# Verify publication
npm view pathao-unofficial

# Package should now be available at:
# - NPM: https://www.npmjs.com/package/pathao-unofficial
# - GitHub: https://github.com/mojahid2021/pathao-unofficial
```

### Subsequent Publishing (Version Bumps)

```bash
# Bump version (choose one):
npm version patch  # 0.1.0 -> 0.1.1 (bug fixes)
npm version minor  # 0.1.0 -> 0.2.0 (new features)
npm version major  # 0.1.0 -> 1.0.0 (breaking changes)

# Tests run automatically (prepublishOnly)
# Then publish
npm publish

# View on NPM
npm view pathao-unofficial versions
```

## Step 8: Create a Release on GitHub (Optional)

```bash
# Create annotated tag for this release
git tag -a v0.1.0 -m "Release version 0.1.0: Initial publication"

# Push tag to GitHub
git push origin v0.1.0

# Then on GitHub:
# 1. Go to https://github.com/mojahid2021/pathao-unofficial/releases
# 2. Click "Releases" tab
# 3. Find your tag v0.1.0
# 4. Edit it to create a release with description
```

## Verify Publishing

### Check NPM Package

```bash
# View package on NPM
npm view pathao-unofficial

# Install from NPM to test
npm install pathao-unofficial

# Or test locally
npm install /root/pathao-unofficial
```

### Use Package in Other Projects

```bash
# Create a test project
mkdir test-pathao
cd test-pathao
npm init -y
npm install pathao-unofficial

# Create test.js
cat > test.js << 'EOF'
import { PathaoClient } from 'pathao-unofficial';
const client = new PathaoClient();
console.log('Version:', client.version());
EOF

node test.js
```

## Troubleshooting

### "You do not have permission to publish this package"

- Package name might already exist on NPM
- Solution: Choose a different name, or contact NPM support if you own the package
- Scoped packages: `pathao-unofficial`

### "npm ERR! not found: npm"

- NPM not installed or not in PATH
- Solution: Install Node.js from https://nodejs.org

### "Error: You need to set the email in git"

```bash
git config --global user.email "aammojahid@gmail.com"
git config --global user.name "Md Mojahid"
```

### "fatal: 'origin' does not appear to be a git repository"

- Remote not initialized
- Solution: Run `git remote add origin https://github.com/mojahid2021/pathao-unofficial.git`

### Tests Fail Before Publishing

- The `prepublishOnly` script runs tests automatically
- Fix: Run `npm test` locally first to verify

```bash
npm test
# If it fails, fix issues before publishing
```

## Package Contents

When published, NPM will include:
- `src/` - All source files
- `README.md` - Documentation
- `LICENSE` - MIT License
- `package.json` - Package metadata

Excluded (kept private):
- `node_modules/` - Installed dependencies
- `test/` - Test files (specified in .gitignore logic)
- `.git/` - Git metadata
- `.gitignore`, `.DS_Store`, `*.log` - Development files

## After Publishing

### Announce Your Package

- Share on Twitter, Reddit, Dev.to, Hacker News
- Add to Awesome lists (e.g., awesome-nodejs)
- Share in relevant Slack communities

### Continuous Updates

```bash
# For bug fixes
npm version patch && npm publish

# For new features
npm version minor && npm publish

# For breaking changes (rare)
npm version major && npm publish
```

## Additional Resources

- **NPM Documentation**: https://docs.npmjs.com/
- **GitHub Help**: https://help.github.com/
- **Semantic Versioning**: https://semver.org/
- **Keep a Changelog**: https://keepachangelog.com/

---

**Ready to publish?** Run this checklist:

- [ ] Updated `package.json` with author info and GitHub URL
- [ ] All tests pass (`npm test`)
- [ ] Local package test works (`npm pack`)
- [ ] GitHub repository created
- [ ] Local repo connected to GitHub
- [ ] All commits pushed to GitHub
- [ ] NPM account created at https://npmjs.com
- [ ] Logged into NPM (`npm login`)
- [ ] Ready to publish (`npm publish`)
