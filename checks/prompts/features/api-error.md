{route} crashes with a server error. The route is in {file}.
Find the error in the server logs, fix the cause, and make the handler answer a clear error (4xx with a message) instead of a 500 when something expected goes wrong. Log unexpected errors.
Acceptance check: the route answers 2xx for a normal request, and the feature that uses it works.

{evidence}
