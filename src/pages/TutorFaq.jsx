import React, { useState } from 'react';
import {
  HelpCircle,
  LayoutDashboard,
  MessageSquare,
  CheckSquare,
  Award,
  ExternalLink,
  Bell,
  ChevronDown,
  BookOpen,
} from 'lucide-react';

const FAQ_SECTIONS = [
  {
    category: '1. Dashboard Overview',
    icon: LayoutDashboard,
    items: [
      {
        q: 'What can I see on my main Dashboard?',
        a: 'Your Dashboard gives you a real-time summary of your monthly teaching activity: Classes Conducted, My Feedback count, My Courses, Attendance %, Discipline %, Quality (QC) score, and your current performance status. Below the summary cards, you can manage your Assigned Tasks, Monthly Student Feedback, and submit QC lesson recordings.',
      },
      {
        q: 'How is "Classes Conducted" calculated?',
        a: 'Classes Conducted counts all regular group and individual lessons you have taught within the selected month (excluding trial/test groups) where student attendance was recorded in the Back Office schedule.',
      },
    ],
  },
  {
    category: '2. Monthly Student Feedback',
    icon: MessageSquare,
    items: [
      {
        q: 'How do I complete my Monthly Student Feedback?',
        a: 'On your Dashboard under "My Monthly Student Feedback", click the purple "Process" button next to an assigned group or private class. Fill in the student feedback points and notes for each student, then submit. Once completed, the status automatically updates to Done and counts toward your Discipline score.',
      },
      {
        q: 'What if a class is postponed or rescheduled?',
        a: 'Click the "Reschedule" button on the corresponding feedback card and select the updated lesson date so your weekly deadline adjusts accurately without penalizing your discipline score.',
      },
      {
        q: 'When are feedback assignments updated?',
        a: 'New feedback targets are synced weekly based on your Lesson 4, Lesson 8, Lesson 12, and monthly milestone classes. Automated reminders are also sent via Telegram if any feedback is pending near the deadline.',
      },
    ],
  },
  {
    category: '3. My Metric, Attendance & Discipline',
    icon: Award,
    items: [
      {
        q: 'How are my Tutor Metric scores calculated?',
        a: 'Your overall performance is evaluated across three core pillars: (1) Attendance % (student attendance rate across your conducted classes), (2) Discipline % (timely submission of Monthly Student Feedback combined with QC Meeting attendance), and (3) Quality (QC) score from your monthly lesson evaluations.',
      },
      {
        q: 'How is QC Meeting attendance weighted in Discipline %?',
        a: 'For biweekly or monthly QC & Team Leader meetings: Hadir (Present) = 100%, Ijin (Excused with prior notice) = 75%, and Tidak Hadir (Unexcused absence) = 0%.',
      },
      {
        q: 'How often are Metric figures updated?',
        a: 'Classes Conducted, Attendance %, and Discipline % are updated every Tuesday. Quality (QC) scores are updated monthly based on the previous month’s QC evaluation results.',
      },
      {
        q: 'What do the Performance Status badges mean?',
        a: '90–100 = High Performer | 80–89 = Stable Performer | 70–79 = Need Improvement | Below 70 = Probation Candidate.',
      },
    ],
  },
  {
    category: '4. QC Tutor & Submissions',
    icon: CheckSquare,
    items: [
      {
        q: 'Where do I submit my lesson video/link for QC evaluation?',
        a: 'You can submit your lesson recording directly from the "QC Evaluation Submission" panel at the bottom of your Dashboard, or via the sidebar under QC Tutor → QC Submissions.',
      },
      {
        q: 'How can I view my past QC feedback and evaluation scores?',
        a: 'Go to QC Tutor → My QC Results in the left sidebar to review your evaluation scores, aspect breakdowns, and constructive feedback from the QC Team.',
      },
    ],
  },
  {
    category: '5. Useful Links & Profile Settings',
    icon: BookOpen,
    items: [
      {
        q: 'What is inside the "Useful Links" menu?',
        a: 'Clicking "Useful Links" in the left sidebar opens the official Algonova Malaysia Tutor Portal (https://algo-my.netlify.app/) in a new browser tab, giving you quick access to lesson materials, teaching guidelines, and tutor resources.',
      },
      {
        q: 'How do I update my profile or link my Telegram notifications?',
        a: 'Click "My Profile" at the bottom of the left sidebar to update your display details, password, or verify your Telegram connection for task and feedback reminders.',
      },
    ],
  },
];

export default function TutorFaq() {
  const [openIndex, setOpenIndex] = useState('0-0');

  const toggleItem = (key) => {
    setOpenIndex((prev) => (prev === key ? null : key));
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-2.5">
            <HelpCircle className="w-7 h-7 text-primary" />
            Platform Guide &amp; FAQ
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Everything you need to know about using the Algonova Malaysia Management System.
          </p>
        </div>

        <a
          href="https://algo-my.netlify.app/"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors self-start"
        >
          Open Tutor Portal <ExternalLink className="w-4 h-4" />
        </a>
      </div>

      {/* Quick Info Banner */}
      <div className="bg-primary/5 border border-primary/20 rounded-2xl p-4 flex items-start gap-3">
        <Bell className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
        <div className="text-xs text-muted-foreground leading-relaxed">
          <strong className="text-foreground">Weekly Update Schedule:</strong> Attendance, Classes Conducted, and Discipline metrics are refreshed every <strong className="text-foreground">Tuesday</strong>, while Quality (QC) scores are updated <strong className="text-foreground">monthly</strong> based on your prior month&apos;s evaluation.
        </div>
      </div>

      {/* Accordion Sections */}
      <div className="space-y-5">
        {FAQ_SECTIONS.map((section, sIdx) => {
          const SectionIcon = section.icon;
          return (
            <div key={section.category} className="bg-card border border-border rounded-2xl overflow-hidden">
              <div className="px-5 py-3.5 bg-secondary/40 border-b border-border flex items-center gap-2.5">
                <SectionIcon className="w-4 h-4 text-primary" />
                <h2 className="font-semibold text-sm text-foreground">{section.category}</h2>
              </div>

              <div className="divide-y divide-border">
                {section.items.map((item, iIdx) => {
                  const itemKey = `${sIdx}-${iIdx}`;
                  const isOpen = openIndex === itemKey;
                  return (
                    <div key={itemKey}>
                      <button
                        type="button"
                        onClick={() => toggleItem(itemKey)}
                        className="w-full px-5 py-4 text-left flex items-center justify-between gap-4 hover:bg-secondary/20 transition-colors"
                      >
                        <span className="font-medium text-sm text-foreground">{item.q}</span>
                        <ChevronDown
                          className={`w-4 h-4 text-muted-foreground flex-shrink-0 transition-transform duration-200 ${
                            isOpen ? 'rotate-180 text-primary' : ''
                          }`}
                        />
                      </button>
                      {isOpen && (
                        <div className="px-5 pb-4 text-sm text-muted-foreground leading-relaxed">
                          {item.a}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}