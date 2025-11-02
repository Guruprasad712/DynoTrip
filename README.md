# 🚀 DynoTrip - AI-Powered Travel Planning Assistant


DynoTrip is an intelligent travel planning platform that leverages Google's Gemini AI and MCP tools to create personalized travel experiences. Whether you're planning a weekend getaway or a month-long adventure, DynoTrip simplifies the process by generating customized travel plans based on your preferences.

## 🏆 Hackathon Submission

This project was developed for the Google Cloud Hackathon, showcasing the power of:
- Google's Gemini AI for natural language understanding
- MCP (Multi-Cloud Platform) tools for travel data integration
- Modern web technologies for a seamless user experience

## ✨ Features

- **AI-Powered Itinerary Generation**: Get personalized travel plans in seconds
- **Smart Destination Matching**: Find your perfect destination based on preferences
- **Accommodation & Transportation**: Seamless integration with travel services
- **Real-time Customization**: Modify and refine your travel plan with AI assistance
- **Offline Demo Mode**: Try the app without API keys

## 🛠️ Tech Stack

### Backend
- **Framework**: FastAPI (Python)
- **AI/ML**: Google Gemini, Vertex AI
- **Cloud**: Google Cloud Platform (Cloud Run, Secret Manager)
- **Tools**: MCP (Google ADK)

### Frontend
- **Framework**: Next.js 13+ (App Router)
- **UI**: Material UI, TailwindCSS
- **State Management**: React Context API
- **Build**: TypeScript, Vercel

## 🚀 Solution Overview

DynoTrip is a comprehensive travel planning solution that leverages cutting-edge AI to simplify trip planning. Here's how it works:

### Core Features
- **AI-Powered Planning**: Utilizes Google's Gemini AI to understand travel preferences and generate personalized itineraries
- **Smart Integration**: Seamlessly connects with MCP tools for real-time travel data and recommendations
- **Responsive Interface**: Modern, mobile-friendly UI built with Next.js and Material-UI
- **Cloud-Native Architecture**: Designed for scalability on Google Cloud Platform

### Technical Highlights
- **Backend**: FastAPI microservices with async support
- **Frontend**: Next.js with App Router for optimal performance
- **AI/ML**: Google Gemini for natural language understanding
- **Deployment**: Containerized with Docker for consistent environments

## 🌐 Live Demo

Experience DynoTrip in action by visiting our hosted demo. No setup required!

[![Live Demo](https://img.shields.io/badge/View-Live%20Demo-blue?style=for-the-badge&logo=google-chrome)](https://drive.google.com/file/d/1k4xqbaF_Wwn6Ln8wDKUx5D-IRFYkb3Fe/view?usp=sharing)

## 🛠️ Getting Started (For Developers)

For developers interested in the technical implementation or contributing to the project, please refer to our [Developer Documentation](docs/DEVELOPMENT.md).

## 📚 Documentation

### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/travel-stay` | POST | Generate travel + stay recommendations |
| `/itinerary-from-selections` | POST | Create itinerary from user selections |
| `/itinerary` | POST | Refine existing itinerary |

### Project Structure

```
dynotrip/
├── backend/               # FastAPI service
│   ├── api/              # API routes
│   ├── agents/           # AI agents
│   ├── services/         # Business logic
│   └── requirements.txt  # Python dependencies
└── frontend/            # Next.js application
    ├── app/             # App router pages
    ├── pages/           # API routes
    └── public/          # Static assets
```

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request


