export default {
  branches: ['main'],
  plugins: [
    '@semantic-release/commit-analyzer',
    '@semantic-release/release-notes-generator',
    ['@semantic-release/changelog', {
      changelogFile: 'CHANGELOG.md',
    }],
    ['@semantic-release/npm', {
      npmPublish: false,
    }],
    // Sync SKILL.md frontmatter version to match package.json before git
    // stages the release commit. Skillsmith's trust-tier validator reads
    // SKILL.md version: directly, so drift here demotes the trust tier.
    ['@semantic-release/exec', {
      prepareCmd: 'node scripts/sync-skill-version.mjs ${nextRelease.version}',
    }],
    ['@semantic-release/git', {
      assets: ['CHANGELOG.md', 'package.json', 'package-lock.json', 'SKILL.md'],
      message: 'chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}',
    }],
    '@semantic-release/github',
  ],
};
