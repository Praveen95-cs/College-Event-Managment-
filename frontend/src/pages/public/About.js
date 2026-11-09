import React from 'react';

const About = () => {
  return (
    <div className="max-w-3xl mx-auto py-4">
      <div className="rounded-[16px] bg-[#1c1a18] border border-[#efe9de]/[0.08] p-8 space-y-8">
        <div className="pb-6 border-b border-[#efe9de]/[0.08]">
          <h1 className="text-[28px] sm:text-[32px] font-medium tracking-[-0.02em] text-[#efe9de] leading-[1.15]">
            About Avenor
          </h1>
          <p className="mt-2 text-[15px] text-[#aaa398] leading-relaxed">
            Campus event operations, YouPI-PG V2 ticket reconciliation, verified student onboarding, Campus Feed communities, and timed AI/sandboxed arenas in one platform.
          </p>
        </div>

        <div className="space-y-8 text-[15px] text-[#aaa398] leading-relaxed">
          <section className="space-y-2">
            <h2 className="text-[17px] font-medium text-[#ebb05d]">Purpose</h2>
            <p>
              Avenor unifies students, verified campus clubs, department organizers, and administrators around one trustworthy system for workshops, technical symposiums, paid summits, WhatsApp attendee coordination, and coding or quiz competitions.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-[17px] font-medium text-[#ebb05d]">Core capabilities</h2>
            <ul className="space-y-2 list-disc list-inside text-[#efe9de]/90">
              <li>Email OTP-verified student registration and self-service password recovery</li>
              <li>Post-publish event management, seat reservations, and automated student email confirmations</li>
              <li>YouPI-PG V2 zero-fee UPI QR &amp; UTR reconciliation unlocking competition passes and official WhatsApp group links</li>
              <li>Campus Feed with verified department clubs, followable chapters, announcements, likes, bookmarks, and comments</li>
              <li>Venue attendance check-in ledger (present/absent/unmarked) with Excel roster exports and A4 PDF certificates</li>
              <li>AI-cached timed MCQ quizzes and sandboxed C++, Python, Java, and JavaScript coding arenas with live leaderboards</li>
              <li>Admin governance over academic departments, organizer &amp; student accounts, and automatic cloud cleanup of expired events</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-[17px] font-medium text-[#ebb05d]">Maintainers</h2>
            <p>
              Built by an Anna University / MIT student engineering team focused on transparent, reliable, production-grade tooling for academic event coordination.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-[17px] font-medium text-[#ebb05d]">Contact</h2>
            <p>
              Questions, department requests, or platform feedback can be sent to the campus team:
            </p>
            <div className="pt-1 space-y-1 font-mono text-[13px] text-[#efe9de]">
              <p>2023503013@student.annauniv.edu</p>
              <p>2023503503@student.annauniv.edu</p>
              <p>2023503015@student.annauniv.edu</p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default About;
