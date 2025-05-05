# College Event Manager

A MERN stack application for managing college events with AI-powered motivation features.

## Features

- User authentication and role-based access control
- Event creation, management, and booking
- AI-powered motivation menu for events
- Real-time notifications
- Admin dashboard and analytics

## Tech Stack

- **Frontend**: React.js, TailwindCSS
- **Backend**: Node.js, Express.js
- **Database**: MongoDB
- **AI Integration**: OpenAI API
- **Authentication**: JWT

## Prerequisites

- Node.js (v14 or higher)
- MongoDB
- OpenAI API key
- npm or yarn

## Setup Instructions

1. Clone the repository
2. Install dependencies:
   ```bash
   npm run install-all
   ```
3. Create a `.env` file in the backend directory with the following variables:
   ```
   MONGODB_URI=your_mongodb_uri
   JWT_SECRET=your_jwt_secret
   OPENAI_API_KEY=your_openai_api_key
   ```
4. Start the development servers:
   ```bash
   npm start
   ```

## Project Structure

```
college-event-manager/
├── frontend/           # React frontend application
├── backend/            # Node.js backend server
└── package.json        # Root package.json for monorepo
```

## Available Scripts

- `npm start`: Runs both frontend and backend servers
- `npm run server`: Runs only the backend server
- `npm run client`: Runs only the frontend server
- `npm run install-all`: Installs dependencies for both frontend and backend

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a new Pull Request
