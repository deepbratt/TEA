# Security policy

## Reporting a vulnerability

Please don't open a public issue for security problems. Report them privately through GitHub: go to the **Security** tab of this repository and choose **Report a vulnerability**.

Include what you found, how to reproduce it, and the TEA version (`tea-qa --version`). You'll get a reply within 5 working days. Once a fix ships, we'll credit you in the release notes unless you'd rather stay anonymous.

## What counts

TEA runs against other people's apps and code, so these matter most:

- TEA writing to, or changing data on, a target outside sandbox mode
- TEA visiting hosts outside the user's allowlist, or ignoring the skip list
- Secrets (keys, tokens, passwords) appearing unmasked in terminal output, reports or JSON files
- Content from a scanned repo, docs or page (text, `tea.yaml`, scripts, plugins) making TEA run code or change its behaviour without the user's consent
- Fix prompts that pass untrusted page or doc text to a coding agent without marking it as untrusted

## Supported versions

Only the latest release gets security fixes until TEA reaches 1.0.

## Using TEA responsibly

Only test apps you own or are authorised to test. TEA is read-only against live URLs, and load tests, active scans and destructive tests never run against production. TEA's score is not a security guarantee, audit or certification.
