{route} answers with data to people who aren't signed in. The route is in {file}.
Check the session at the top of the handler and answer 401 when there isn't one. Then make sure signed-in users only get their own data (filter by their user id), and that admin routes check the role.
Acceptance check: signed out, it answers 401; signed in, each user only sees their own records.

{evidence}
