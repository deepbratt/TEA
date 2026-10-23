The form on {route} accepts "not-an-email" as an email address. The page is in {file}.
Validate the email both in the form (use an email input) and on the server (reject invalid addresses with a 400 and a clear message). Don't save anything when it's invalid.
Acceptance check: "not-an-email" is refused with a clear message; a real address still works.

{evidence}
