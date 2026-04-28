import { useState } from 'react'
import './App.css'

function App() {
  const [count, setCount] = useState(0)

  return (
    <div className="container">
      <header>
        <h1>🎓 WorkLearn AI Platform</h1>
        <p>AI-Native Learning Platform for Career Development</p>
      </header>

      <main>
        <section className="hero">
          <h2>Welcome to WorkLearn Career</h2>
          <p>Build your skills with AI-powered learning paths</p>
          
          <div className="stats">
            <div className="stat">
              <h3>100+</h3>
              <p>Learning Paths</p>
            </div>
            <div className="stat">
              <h3>5000+</h3>
              <p>Active Users</p>
            </div>
            <div className="stat">
              <h3>24/7</h3>
              <p>AI Support</p>
            </div>
          </div>
        </section>

        <section className="features">
          <h2>Platform Features</h2>
          <div className="feature-grid">
            <div className="feature">
              <h3>🤖 AI Learning</h3>
              <p>Personalized learning paths powered by Claude AI</p>
            </div>
            <div className="feature">
              <h3>💼 Career Tools</h3>
              <p>Resume builder, interview prep, and job matching</p>
            </div>
            <div className="feature">
              <h3>📊 Progress Tracking</h3>
              <p>Real-time analytics and performance metrics</p>
            </div>
            <div className="feature">
              <h3>🏆 Achievements</h3>
              <p>Earn certificates and build your portfolio</p>
            </div>
          </div>
        </section>

        <section className="cta">
          <h2>Ready to Transform Your Career?</h2>
          <p>Start learning with AI today</p>
          <button className="btn-primary" onClick={() => setCount(count + 1)}>
            Get Started (Clicked: {count})
          </button>
          <p className="api-status">
            ✅ Frontend deployed successfully on Cloudflare Pages
          </p>
        </section>
      </main>

      <footer>
        <p>&copy; 2024 WorkLearn AI. All rights reserved.</p>
        <p>
          <a href="https://github.com/astragenxy-bit/astra" target="_blank" rel="noopener noreferrer">
            GitHub Repository
          </a>
        </p>
      </footer>
    </div>
  )
}

export default App
