# Contributing Guidelines

Thank you for your interest in contributing to Ampdeck+! We welcome contributions of all kinds, including bug reports, feature requests, code improvements, and documentation updates.

## How to Contribute

1. **Fork the repository**
2. **Create a feature branch**
   - `git checkout -b feature/your-feature-name`
3. **Make your changes** in the `src/` directory
4. **Test your changes**
   - Use `npm run dev` to watch for changes
   - Use `npm run lint` to ensure code quality
5. **Commit your changes**
   - `git commit -m 'Describe your change'`
6. **Push to your fork**
   - `git push origin feature/your-feature-name`
7. **Open a Pull Request**
   - Describe your changes and reference any related issues

## Code Quality Standards

- **Modular Design**: New features should be self-contained modules
- **Input Validation**: Always validate user input
- **Error Handling**: Use try/catch and provide meaningful errors
- **Logging**: Use the logger module, not `console.log`
- **Linting**: Code must pass `npm run lint` with zero warnings

## Development Workflow

- Test with `npm run dev` (watches for changes)
- Lint with `npm run lint`
- Build with `npm run build`

## Reporting Issues

If you find a bug or have a feature request, please [open an issue](https://github.com/DreadHeadHippy/AmpdeckPlus/issues) and provide as much detail as possible.

## Code of Conduct

Please note that this project is released with a [Code of Conduct](CODE_OF_CONDUCT.md). By participating in this project you agree to abide by its terms.

---

Thank you for helping make Ampdeck+ better!
