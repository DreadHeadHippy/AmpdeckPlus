# Security Policy

## Supported Versions

Currently, only the latest version of Ampdeck+ is supported with security updates.

| Version | Supported          |
| ------- | ------------------ |
| 2.0.x   | :white_check_mark: |
| < 2.0   | :x:                |

## Reporting a Vulnerability

If you discover a security vulnerability in Ampdeck+, please report it responsibly:

1. **Do NOT** open a public GitHub issue for security vulnerabilities
2. Email the maintainer directly at 155098676+DreadHeadHippy@users.noreply.github.com
3. Include the following information:
   - Description of the vulnerability
   - Steps to reproduce the issue
   - Potential impact
   - Any suggested fixes (if applicable)

### What to Expect

- **Response Time**: You can expect an initial response within 48 hours
- **Updates**: We'll keep you informed about the progress of fixing the vulnerability
- **Disclosure**: Once the vulnerability is fixed, we'll work with you on coordinated disclosure
- **Credit**: If you wish, we'll credit you in the release notes for responsibly disclosing the issue

## Security Considerations

### Plex Token Storage

Ampdeck+ stores your Plex authentication token locally in the Stream Deck configuration. This token provides access to your Plex account:

- Tokens are stored in Stream Deck's secure settings storage
- Never share your configuration files with untrusted parties
- Debug logs automatically sanitize tokens before output

### Network Communication

- All communication with Plex servers uses the credentials you provide
- The plugin connects to your local Plexamp instance and Plex server
- No data is transmitted to third parties
- All API calls are made directly to your Plex infrastructure

### Best Practices

1. Only download Ampdeck+ from official sources (GitHub releases or Elgato Marketplace)
2. Keep your Plex token secure and never share it publicly
3. Use debug logging only when troubleshooting (tokens are sanitized, but other sensitive info may appear)
4. Regularly update to the latest version for security patches

## Third-Party Dependencies

Ampdeck+ uses minimal dependencies. Security updates for dependencies are monitored and applied promptly. You can audit dependencies by checking `package.json`.

---

Thank you for helping keep Ampdeck+ and its users safe!
