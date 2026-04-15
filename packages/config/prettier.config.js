/**
 * Shared Prettier configuration for SLO Events Platform
 *
 * Ensures consistent code formatting across all apps and packages.
 */

module.exports = {
  // Formatting options
  printWidth: 80,
  tabWidth: 2,
  useTabs: false,
  semi: true,
  singleQuote: true,
  quoteProps: 'as-needed',
  jsxSingleQuote: false,
  trailingComma: 'es5',
  bracketSpacing: true,
  bracketSameLine: false,
  arrowParens: 'always',

  // Prose
  proseWrap: 'preserve',

  // HTML
  htmlWhitespaceSensitivity: 'css',

  // Newlines
  endOfLine: 'lf',

  // Plugin options (if needed in the future)
  plugins: [],

  // Override options for specific file types
  overrides: [
    {
      files: '*.json',
      options: {
        printWidth: 120,
      },
    },
    {
      files: '*.md',
      options: {
        proseWrap: 'always',
      },
    },
    {
      files: '*.yml',
      options: {
        tabWidth: 2,
      },
    },
  ],
};
