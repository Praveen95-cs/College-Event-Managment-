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
            Campus event operations, seat registration, and timed technical arenas in one place.
          </p>
        </div>

        <div className="space-y-8 text-[15px] text-[#aaa398] leading-relaxed">
          <section className="space-y-2">
            <h2 className="text-[17px] font-medium text-[#ebb05d]">Purpose</h2>
            <p>
              Avenor connects students, department organizers, and campus administrators around one shared schedule for workshops, symposiums, quizzes, and coding competitions.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-[17px] font-medium text-[#ebb05d]">Core capabilities</h2>
            <ul className="space-y-2 list-disc list-inside text-[#efe9de]/90">
              <li>Event publishing, approval queues, and attendance tracking for organizers</li>
              <li>Seat reservations and event schedules for students</li>
              <li>Real-time campus announcements and event updates</li>
              <li>Payment recording for paid workshops and sessions</li>
              <li>Attendance reporting and Excel/PDF exports</li>
              <li>Timed quiz and isolated coding arenas with merit certificates</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-[17px] font-medium text-[#ebb05d]">Maintainers</h2>
            <p>
              Built by a student engineering team focused on reliable, straightforward tooling for academic event coordination.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-[17px] font-medium text-[#ebb05d]">Contact</h2>
            <p>
              Questions or feedback can be sent to the campus team:
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

export default About;
