# Project Conventions

## After Making Changes

After modifying code, ensure to run the following commands to maintain code quality:

- `npm run ci` - Run all checks (tests + lint + format check)

Or run individually:

- `npm run lint` - Lint code (ESLint)
- `npm run lint:fix` - Lint and auto-fix
- `npm run format` - Format code with Prettier
- `npm run format:check` - Check formatting without writing

Refer to [DEVELOPMENT.md](DEVELOPMENT.md) for project setup, scripts, and technical details.
