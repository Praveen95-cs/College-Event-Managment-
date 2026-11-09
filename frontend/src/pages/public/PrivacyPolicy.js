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
              This Privacy Policy explains how Avenor collects, uses, and protects information when you use the campus event and competition platform. If you do not agree with these practices, please do not use the platform.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-[17px] font-medium text-[#ebb05d]">Information we collect</h2>
            <p>We collect details you submit directly during registration and participation:</p>
            <ul className="space-y-1.5 list-disc list-inside text-[#efe9de]/90">
              <li>Identity details (name, email address, phone number)</li>
              <li>Academic records (student ID, department, year)</li>
              <li>Event registrations, quiz answers, and code submissions</li>
              <li>Payment references processed through supported providers</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-[17px] font-medium text-[#ebb05d]">How we use information</h2>
            <p>Collected records are used to:</p>
            <ul className="space-y-1.5 list-disc list-inside text-[#efe9de]/90">
              <li>Process event seat reservations and issue certificates</li>
              <li>Deliver event updates and schedule notifications</li>
              <li>Maintain competition leaderboards and scoring integrity</li>
              <li>Prevent unauthorized access and protect account security</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-[17px] font-medium text-[#ebb05d]">Data security</h2>
            <p>
              We apply technical and organizational safeguards to protect stored records. No internet transmission or storage mechanism can be guaranteed 100% secure.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-[17px] font-medium text-[#ebb05d]">Your rights</h2>
            <p>You may request to:</p>
            <ul className="space-y-1.5 list-disc list-inside text-[#efe9de]/90">
              <li>Review the personal information held on your account</li>
              <li>Correct inaccurate department or contact details</li>
              <li>Request removal of your account data</li>
              <li>Opt out of non-essential announcements</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-[17px] font-medium text-[#ebb05d]">Contact</h2>
            <p>
              For questions about this policy, reach out to:
            </p>
            <div className="pt-1 space-y-1 font-mono text-[13px] text-[#efe9de]">
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
  );
};

export default PrivacyPolicy;
