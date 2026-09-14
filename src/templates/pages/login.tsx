/**
 * Login page template
 * Note: Login page doesn't use the standard layout with header since user is not authenticated
 */
import type { ReaderSettings } from "../../config";
import { DEFAULT_READER_SETTINGS } from "../../config";

export function LoginPage({
  settings = DEFAULT_READER_SETTINGS,
  error,
  next,
}: {
  settings?: ReaderSettings;
  error?: string;
  next?: string;
}): JSX.Element {
  const darkClass = settings.dark ? "dark-mode" : "";

  return (
    <>
      {"<!DOCTYPE html>"}
      <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>Login - Tome</title>
          <link rel="stylesheet" href="/public/css/base.css" />
          <link rel="icon" type="image/x-icon" href="/public/favicon.ico" />
        </head>
        <body class={darkClass || undefined}>
          <div style="max-width: 400px; margin: 60px auto; padding: 0 16px;">
            <div style="text-align: center; margin-bottom: 32px;">
              <h1 style="border: none; margin: 0;">Tome</h1>
              <p>Read web fiction on your e-ink device.</p>
            </div>

            {error && (
              <div class="error">
                <span safe>{error}</span>
              </div>
            )}

            <form method="POST" action="/login">
              {next && <input type="hidden" name="next" value={next} />}
              <div class="form-group">
                <label for="username">Username</label>
                <input
                  type="text"
                  id="username"
                  name="username"
                  required
                  autocomplete="username"
                />
              </div>

              <div class="form-group">
                <label for="password">Password</label>
                <input
                  type="password"
                  id="password"
                  name="password"
                  required
                  autocomplete="current-password"
                />
              </div>

              <button type="submit" class="btn" style="width: 100%; margin-top: 8px;">
                Sign In
              </button>
            </form>
          </div>
        </body>
      </html>
    </>
  );
}
