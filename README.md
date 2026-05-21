# PacketHub Backend

PacketHub is a beginner-friendly IT forum backend built with Express.js and PostgreSQL. This backend is designed to support the documented API routes for authentication, profiles, posts, comments, voting, conversations, and admin management.

## Setup

1. Copy `.env.example` to `.env`
2. Set `DATABASE_URL` to your PostgreSQL connection string
3. Install dependencies:

```bash
npm install
```

4. Start the server:

```bash
npm run dev
```

The backend will automatically initialize the database schema on startup.

## Docker

Start the app and database with:

```bash
docker compose up --build
```

The app will be available at `http://localhost:4000`.

Adminer will be available at `http://localhost:8080`.

To stop and remove containers:

```bash
docker compose down
```

## API overview

Base URL: `http://localhost:4000/api`

### Auth

- `POST /auth/signup`
- `POST /auth/login`
- `POST /auth/logout`
- `GET /auth/session`
- `POST /auth/password-reset`
- `POST /auth/password-reset/confirm`
- `PATCH /auth/password`
- `PATCH /auth/email`

### Profiles

- `GET /profiles/me`
- `GET /profiles/:username`
- `PATCH /profiles/me`

### Posts

- `GET /posts`
- `GET /posts/:id`
- `POST /posts`
- `PUT /posts/:id`
- `DELETE /posts/:id`

### Comments

- `GET /posts/:postId/comments`
- `POST /posts/:postId/comments`
- `DELETE /comments/:id`

### Voting

- `POST /posts/:id/votes`
- `DELETE /posts/:id/votes`

### Conversations

- `GET /conversations`
- `GET /conversations/:id/messages`
- `POST /conversations`
- `POST /conversations/:id/messages`

### Admin

- `GET /admin/profiles`
- `GET /admin/auth-users`
- `GET /admin/user-roles`
- `POST /admin/user-roles`
- `DELETE /admin/user-roles`
- `POST /admin/users/delete`
- `GET /admin/role-audit-log`
