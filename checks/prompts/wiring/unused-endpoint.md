The backend route {route} (in {file}) isn't called anywhere in the frontend code.
If something outside the app calls it (a webhook, a cron job, a mobile app), leave it and document who calls it. If it's left over, remove it: unused endpoints are extra attack surface.

{evidence}
