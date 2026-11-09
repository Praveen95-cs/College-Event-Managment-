import React from 'react';

const PrivacyPolicy = () => {
  return (
    <div className="max-w-3xl mx-auto py-4">
      <div className="rounded-[16px] bg-[#1c1a18] border border-[#efe9de]/[0.08] p-8 space-y-8">
        <div className="pb-6 border-b border-[#efe9de]/[0.08]">
          <h1 className="text-[28px] sm:text-[32px] font-medium tracking-[-0.02em] text-[#efe9de] leading-[1.15]">
            Privacy policy
          </h1>
          <p className="mt-2 text-[13px] font-mono text-[#8a847a] tabular-nums">
            Last updated: {new Date().toLocaleDateString()}
          </p>
        </div>

        <div className="space-y-8 text-[15px] text-[#aaa398] leading-relaxed">
          <section className="space-y-2">
            <h2 className="text-[17px] font-medium text-[#ebb05d]">Overview</h2>
            <p>
              This Privacy Policy describes how Avenor collects, processes, protects, and deletes personal and academic event data across event registrations, email OTP verification, YouPI-PG V2 payment reconciliation, Campus Feed activity, and timed technical competitions.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-[17px] font-medium text-[#ebb05d]">Information we collect</h2>
            <p>We process only the details needed to run campus events and verify eligibility:</p>
            <ul className="space-y-1.5 list-disc list-inside text-[#efe9de]/90">
              <li>Account identity: full name, verified student email address, salted bcrypt password hash, role, and admin-configured department</li>
              <li>OTP verification records: HMAC-SHA256 hashed 6-digit verification and password-reset codes (automatically purged after 10 minutes or verification)</li>
              <li>Event passes &amp; attendance: registration numbers, accommodation preference, venue check-in status, and confirmation mail delivery timestamps</li>
              <li>YouPI-PG V2 payment references: generated order IDs, payee VPA metadata, submitted 12-digit UTR references, and reconciliation audit state (Avenor never collects UPI PINs, bank passwords, or card numbers)</li>
              <li>Competitions &amp; community participation: timed quiz answers, sandboxed code submissions, leaderboard scores/timings, club follows, likes, saves, and moderated comments</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-[17px] font-medium text-[#ebb05d]">How we use information</h2>
            <p>Collected data is strictly used for campus operations:</p>
            <ul className="space-y-1.5 list-disc list-inside text-[#efe9de]/90">
              <li>Verifying student accounts on signup and authorizing secure password resets via email OTP</li>
              <li>Mailing digital passes, YouPI payment receipts, and post-payment WhatsApp group invite links directly to your registered student email ID</li>
              <li>Reconciling paid seats to unlock linked workshops, competitions, and participation/merit PDF certificates</li>
              <li>Generating organizer attendance sheets (Excel/PDF) and accurate leaderboard rankings</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-[17px] font-medium text-[#ebb05d]">Security &amp; data retention</h2>
            <p>
              Passwords are protected using bcrypt (cost factor 12), authentication uses signed JWTs re-validated against current user roles on the server, and all payment webhook confirmations undergo HMAC-SHA256 signature verification and replay deduplication. Expired events configured under the Admin cloud cleanup policy—including linked registrations, sessions, posts, and media—are automatically purged from MongoDB Atlas storage.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-[17px] font-medium text-[#ebb05d]">Your rights &amp; account removal</h2>
            <p>You may request through your campus administrator to:</p>
            <ul className="space-y-1.5 list-disc list-inside text-[#efe9de]/90">
              <li>Review your registered event passes, payment reconciliation status, and earned certificates in Profile</li>
              <li>Update department assignments within administrator-approved campus departments</li>
              <li>Permanently delete your account, which cascades removal of your registrations, exam attempts, payment sessions, notifications, and social interactions</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-[17px] font-medium text-[#ebb05d]">Contact</h2>
            <p>
              For privacy, account removal, or security inquiries, reach out to:
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

export default PrivacyPolicy;
