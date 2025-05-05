import React from 'react';

const PrivacyPolicy = () => {
  return (
    <div className="min-h-screen bg-gray-900 py-12">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-gray-800 rounded-lg shadow-lg p-8">
          <h1 className="text-3xl font-bold text-gray-100 mb-6">Privacy Policy</h1>
          
          <div className="space-y-6 text-gray-300">
            <section>
              <h2 className="text-xl font-semibold text-violet-400 mb-3">Introduction</h2>
              <p>
                At College Event Manager, we take your privacy seriously. This Privacy Policy explains
                how we collect, use, disclose, and safeguard your information when you use our platform.
                Please read this privacy policy carefully. If you do not agree with the terms of this
                privacy policy, please do not access the platform.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-violet-400 mb-3">Information We Collect</h2>
              <p className="mb-2">We collect information that you provide directly to us, including:</p>
              <ul className="list-disc list-inside space-y-2">
                <li>Personal information (name, email address, phone number)</li>
                <li>Academic information (student ID, department, year)</li>
                <li>Event registration details</li>
                <li>Payment information (processed securely through our payment providers)</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-violet-400 mb-3">How We Use Your Information</h2>
              <p className="mb-2">We use the information we collect to:</p>
              <ul className="list-disc list-inside space-y-2">
                <li>Process your event registrations</li>
                <li>Send you event updates and notifications</li>
                <li>Improve our platform and services</li>
                <li>Communicate with you about your account</li>
                <li>Ensure platform security and prevent fraud</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-violet-400 mb-3">Data Security</h2>
              <p>
                We implement appropriate technical and organizational security measures to protect
                your personal information. However, no method of transmission over the Internet
                or electronic storage is 100% secure, and we cannot guarantee absolute security.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-violet-400 mb-3">Your Rights</h2>
              <p className="mb-2">You have the right to:</p>
              <ul className="list-disc list-inside space-y-2">
                <li>Access your personal information</li>
                <li>Correct inaccurate data</li>
                <li>Request deletion of your data</li>
                <li>Opt-out of marketing communications</li>
                <li>Lodge a complaint with supervisory authorities</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-violet-400 mb-3">Contact Us</h2>
              <p>
                If you have any questions about this Privacy Policy, please contact us at:
              </p>
              <div className="mt-2 space-y-1">
                <p>2023503013@student.annauniv.edu</p>
                <p>2023503503@student.annauniv.edu</p>
                <p>2023503015@student.annauniv.edu</p>
                <p>2023503302@student.annauniv.edu</p>
                <p>2023503525@student.annauniv.edu</p>
              </div>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-violet-400 mb-3">Updates to This Policy</h2>
              <p>
                We may update this privacy policy from time to time. We will notify you of any changes
                by posting the new privacy policy on this page and updating the "Last Updated" date.
              </p>
              <p className="mt-2 text-sm text-gray-400">
                Last Updated: {new Date().toLocaleDateString()}
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PrivacyPolicy; 