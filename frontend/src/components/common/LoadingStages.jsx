import React from 'react';
import { CheckCircle2, Loader2, Circle } from 'lucide-react';

const LoadingStages = ({ currentStage = 0 }) => {
  const stages = [
    { title: "ANALYZING EXAM SCHEDULE", desc: "Parsing CIE session slots & room requirements" },
    { title: "CLASSIFYING SEMESTER MODES", desc: "Identifying dynamic exam vs regular class semesters" },
    { title: "EVALUATING TIMETABLE BUFFER", desc: "Checking 1-hour pre/post class buffer constraints" },
    { title: "VALIDATING FACULTY ELIGIBILITY", desc: "Checking leaves, exclusion flags & simultaneous duties" },
    { title: "OPTIMIZING WORKLOAD FAIRNESS", desc: "Balancing cumulative duties & experience preferences" },
    { title: "GENERATING AUDIT & EXPLANATIONS", desc: "Compiling decision provenance and logging" },
  ];

  return (
    <div className="bg-slate-900 text-white rounded-2xl p-6 shadow-xl border border-slate-800 max-w-lg mx-auto">
      <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-5">
        <div>
          <h3 className="font-bold text-sm tracking-tight text-white">ALLOCATION ENGINE IN PROGRESS</h3>
          <p className="text-xs text-sky-400 mt-0.5">Constraint Satisfaction & Fairness Solver</p>
        </div>
        <Loader2 className="w-5 h-5 text-sky-400 animate-spin" />
      </div>

      <div className="space-y-4">
        {stages.map((stage, idx) => {
          const isDone = idx < currentStage;
          const isCurrent = idx === currentStage;

          return (
            <div
              key={idx}
              className={`flex items-start gap-3 transition-opacity ${
                isDone ? 'opacity-100' : isCurrent ? 'opacity-100' : 'opacity-40'
              }`}
            >
              <div className="mt-0.5">
                {isDone ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                ) : isCurrent ? (
                  <Loader2 className="w-4 h-4 text-sky-400 animate-spin" />
                ) : (
                  <Circle className="w-4 h-4 text-slate-600" />
                )}
              </div>
              <div className="flex-1">
                <div className={`text-xs font-bold tracking-wide ${isDone ? 'text-emerald-300' : isCurrent ? 'text-sky-300' : 'text-slate-400'}`}>
                  {stage.title}
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">{stage.desc}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default LoadingStages;

