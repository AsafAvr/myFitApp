## Cursor Cloud specific instructions

### Overview
Single-service Python 3.9 / Flask web app that visualizes running data as a growing tree via Google Fit API + Canvas.

### Running locally
```bash
source venv/bin/activate
python app.py          # starts on http://localhost:8080 with debug mode
```
The app requires a `.env` file with `FLASK_SECRET_KEY` and `CLIENT_SECRETS` (Google OAuth JSON). For development without real Google credentials, use the `/demo` route which works with mock data.

### Key caveats
- **Python 3.9 required** (`runtime.txt` specifies `python-3.9.6`). Install via `deadsnakes` PPA: `sudo apt-get install python3.9 python3.9-venv python3.9-dev`.
- **requirements.txt has conflicts**: it includes system packages (systemd-python, twisted, SecretStorage) with incompatible version pins. Install only the core deps: `Flask==2.0.1 Flask-WTF==0.15.1 google-api-python-client==2.14.0 google-auth==1.33.0 google-auth-httplib2==0.1.0 google-auth-oauthlib==0.4.4 gunicorn==20.1.0 python-dotenv==0.18.0 requests==2.26.0`, then pin `Werkzeug==2.0.1 Jinja2==3.0.1 MarkupSafe==2.0.1 itsdangerous==2.0.1 click==8.0.1` (Flask 2.0.1 is incompatible with Werkzeug 3.x).
- **`CLIENT_SECRETS` is parsed at module load** (line 48 of `app.py`), so the env var must contain valid JSON or the app will crash on import.
- **No automated tests or linter** configured in this repo.
- **`libsystemd-dev`** system package needed if you install the full requirements.txt (for `systemd-python`), though that package is unused by the app.
