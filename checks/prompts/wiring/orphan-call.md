My frontend calls {route}, but no backend route serves it (or not with that HTTP method). The call is in {file}.
Either add the missing route to the backend, or point the call at the endpoint that already exists. Make the UI show a helpful message if the request fails.
Acceptance check: the call returns 2xx and the feature that uses it works.

{evidence}
