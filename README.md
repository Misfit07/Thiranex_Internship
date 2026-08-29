# Personal Portfolio (Full-Stack)

A compact full-stack portfolio: **Express** backend, **SQLite** database (via `better-sqlite3`),
and a vanilla **HTML/CSS/JS** frontend. No build step, no ORM — one server file, one DB file, three
frontend files.

## Structure
```
portfolio-app/
├── server.js          # Express API + serves the frontend
├── portfolio.db        # SQLite database (auto-created & seeded on first run)
├── package.json
└── public/
    ├── index.html
    ├── style.css
    └── script.js
```

## Run locally
```bash
npm install
npm start
```
Open http://localhost:3000. The database is created and seeded with demo data automatically
the first time you run it — edit the seed block near the top of `server.js` to put in your
own name, bio, skills, and projects (or POST new projects via the API).

## API
| Method | Route              | Description                |
|--------|---------------------|----------------------------|
| GET    | `/api/profile`      | Your name, tagline, bio, links |
| GET    | `/api/skills`       | List of skills              |
| GET    | `/api/projects`     | List of projects            |
| POST   | `/api/projects`     | Add a project (JSON body: `title, description, tech, repo_url, live_url, featured`) |
| DELETE | `/api/projects/:id` | Remove a project            |
| POST   | `/api/messages`     | Contact form submission (`name, email, message`) |

## Customizing content
Easiest path: edit the seed data in `server.js`, delete `portfolio.db`, and restart the server
— it reseeds automatically. For a persistent live site, add projects through the API instead
(e.g. with `curl` or a small admin script) so you don't lose data on redeploy.

## Deploying
`better-sqlite3` writes to a local file, so pick a host with a persistent filesystem
(Heroku's is ephemeral and will wipe the DB on restart/dyno-cycle):

- **Render** (free tier, persistent disk on paid plans) or **Railway** — easiest for this stack:
  1. Push this folder to a GitHub repo.
  2. Create a new **Web Service**, connect the repo.
  3. Build command: `npm install` — Start command: `npm start`.
- **Vercel/Netlify**: these are serverless/static-first and don't support a writable SQLite file
  across requests. If you want to deploy there, swap `better-sqlite3` for a hosted database
  (e.g. **Supabase/Neon Postgres** or **MongoDB Atlas**) and point `server.js` at it — the route
  handlers stay the same, only the DB calls change.

## Swapping the database
The code isolates all DB access in the top of `server.js`. To move to PostgreSQL or MongoDB:
- **Postgres**: replace `better-sqlite3` with `pg`, convert the `db.prepare(...).run/get/all`
  calls to `pool.query(...)`, keep the same table shapes.
- **MongoDB**: replace with the `mongodb` driver, turn each table into a collection.
