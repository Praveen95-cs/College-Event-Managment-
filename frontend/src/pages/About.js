import React from 'react';

const About = () => {
  return (
    <div className="min-h-screen bg-gray-900 py-12">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-gray-800 rounded-lg shadow-lg p-8">
          <h1 className="text-3xl font-bold text-gray-100 mb-6">About College Event Manager</h1>
          
          <div className="space-y-6 text-gray-300">
            <section>
              <h2 className="text-xl font-semibold text-violet-400 mb-3">Our Mission</h2>
              <p>
                College Event Manager is designed to streamline and enhance the event management process
                for educational institutions. Our platform connects students, organizers, and administrators
                in a seamless ecosystem for creating, managing, and participating in college events.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-violet-400 mb-3">Key Features</h2>
              <ul className="list-disc list-inside space-y-2">
                <li>Easy event creation and management for organizers</li>
                <li>Seamless registration process for students</li>
                <li>Real-time event updates and notifications</li>
                <li>Secure payment processing for event fees</li>
                <li>Comprehensive event analytics and reporting</li>
                <li>Mobile-friendly interface for on-the-go access</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-violet-400 mb-3">Our Team</h2>
              <p>
                We are a dedicated team of developers and educators committed to improving the
                event management experience in educational institutions. Our platform is built
                with modern technologies and best practices to ensure reliability, security,
                and user satisfaction.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-violet-400 mb-3">Contact Us</h2>
              <p>
                Have questions or suggestions? We'd love to hear from you! Reach out to us at:
              </p>
              <div className="mt-2 space-y-1">
                <p>2023503013@student.annauniv.edu</p>
                <p>2023503503@student.annauniv.edu</p>
                <p>2023503015@student.annauniv.edu</p>
                <p>2023503302@student.annauniv.edu</p>
                <p>2023503525@student.annauniv.edu</p>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
};

export default About; 