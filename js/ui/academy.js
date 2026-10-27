// Academia: índice de lecciones, lectura con widgets y test final.
import { h, svgIcon, toast, fmt, clear } from '../util.js';
import { store } from '../store.js';
import { LESSONS } from '../data/lessons.js';
import { WIDGETS } from './widgets.js';
import { TRAINERS } from './trainers.js';
import { play } from '../audio.js';
import { progressBar } from './components.js';

const LESSON_REWARD = 500;

export function renderAcademy(root) {
  const s = store.get();
  const done = Object.keys(s.academy.done).length;
  root.appendChild(h('div.section-head',
    h('div', h('h1.h1', 'Academia'), h('p.lead', 'Del reglamento a los rangos por posición, con ejemplos interactivos. Cada lección termina con un test: apruébalo y ganas fichas.')),
    h('div', { style: { minWidth: '220px' } }, h('div.small.muted', { style: { marginBottom: '6px' } }, `${done} de ${LESSONS.length} completadas`), progressBar(done / LESSONS.length)),
  ));
  const course = h('div.course');
  LESSONS.forEach((l, i) => {
    course.appendChild(h('a.lesson-link', { href: '#/academia/' + l.id },
      h('span.num', String(i + 1)),
      h('div', h('h3', l.title), h('p', l.summary), h('p.tiny.faint', { style: { marginTop: '6px' } }, `${l.minutes} min de lectura`)),
      s.academy.done[l.id] ? h('span.done', { title: 'Completada' }, svgIcon('i-check')) : null,
    ));
  });
  root.appendChild(course);
  const tr = h('div.trainers');
  for (const t of TRAINERS) {
    tr.appendChild(h('a.trainer-link', { href: '#/entrenar/' + t.id }, h('span.ico', t.icon), h('strong', t.title), h('span', t.desc)));
  }
  root.appendChild(h('section.section', { id: 'entrenadores' },
    h('div.section-head', h('div', h('h2.h2', 'Entrenadores'), h('p', 'Ejercicios rápidos para automatizar lo aprendido. Cada acierto suma fichas (hasta 3.000 al día).'))),
    tr,
  ));
}

export function renderLesson(root, id, app) {
  const idx = LESSONS.findIndex((l) => l.id === id);
  if (idx < 0) { app.navigate('#/academia'); return; }
  const l = LESSONS[idx];
  store.progress('lessonView');
  const toc = h('nav.lesson-toc', { 'aria-label': 'Índice de la lección' }, h('div.small.faint', { style: { marginBottom: '8px', fontWeight: 700 } }, 'En esta lección'));
  const article = h('article.prose');
  l.sections.forEach((sec, i) => {
    const sid = `s${i}`;
    toc.appendChild(h('a', { href: '#', onclick: (e) => { e.preventDefault(); document.getElementById(sid)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); } }, sec.h));
    article.appendChild(h('h2', { id: sid }, sec.h));
    const body = h('div', { html: sec.body });
    body.querySelectorAll('[data-w]').forEach((ph) => {
      const fn = WIDGETS[ph.dataset.w];
      if (fn) ph.replaceWith(fn());
    });
    article.appendChild(body);
  });
  toc.appendChild(h('a', { href: '#', onclick: (e) => { e.preventDefault(); document.getElementById('quiz')?.scrollIntoView({ behavior: 'smooth' }); } }, 'Test'));
  article.appendChild(renderQuiz(l));
  const prev = LESSONS[idx - 1], next = LESSONS[idx + 1];
  article.appendChild(h('div.lesson-nav',
    prev ? h('a.btn.btn-ghost', { href: '#/academia/' + prev.id }, svgIcon('i-back'), prev.title) : h('span'),
    next ? h('a.btn.btn-ghost', { href: '#/academia/' + next.id }, next.title, svgIcon('i-chevron')) : h('a.btn.btn-ghost', { href: '#/academia' }, 'Volver a la academia'),
  ));
  root.appendChild(h('div.lesson-head',
    h('div.crumbs', h('a.small', { href: '#/academia' }, 'Academia'), h('span.small.faint', ` / Lección ${idx + 1}`)),
    h('h1.h1', l.title),
    h('p.lead', l.summary),
  ));
  root.appendChild(h('div.lesson-layout', article, toc));
}

function renderQuiz(lesson) {
  const box = h('section.quiz', { id: 'quiz' });
  const done = store.get().academy.done[lesson.id];
  box.appendChild(h('h3.h2', { style: { fontSize: '1.4rem' } }, 'Comprueba lo aprendido'));
  if (!done) box.appendChild(h('p.small.muted', `Acierta al menos ${Math.ceil(lesson.quiz.length * 0.6)} de ${lesson.quiz.length} para completar la lección y ganar ${fmt(LESSON_REWARD)} fichas.`));
  const answers = new Array(lesson.quiz.length).fill(null);
  const result = h('div');
  lesson.quiz.forEach((q, qi) => {
    const opts = h('div.quiz-opts');
    const ex = h('div.explain', { hidden: true }, q.explain);
    q.options.forEach((o, oi) => {
      const b = h('button.opt', { type: 'button' }, o);
      b.addEventListener('click', () => {
        if (answers[qi] !== null) return;
        answers[qi] = oi;
        [...opts.children].forEach((c, ci) => {
          c.disabled = true;
          if (ci === q.answer) c.classList.add('correct');
          else if (ci === oi) c.classList.add('wrong');
        });
        ex.hidden = false;
        play(oi === q.answer ? 'success' : 'error');
        if (answers.every((a) => a !== null)) finish();
      });
      opts.appendChild(b);
    });
    box.appendChild(h('div.quiz-q', h('p', `${qi + 1}. ${q.q}`), opts, ex));
  });
  const finish = () => {
    const correct = answers.filter((a, i) => a === lesson.quiz[i].answer).length;
    const pass = correct >= Math.ceil(lesson.quiz.length * 0.6);
    clear(result);
    if (pass) {
      const first = !store.get().academy.done[lesson.id];
      if (first) {
        store.update((s) => { s.academy.done[lesson.id] = Date.now(); });
        store.addBalance(LESSON_REWARD, 'lección');
        store.addXp(50);
        const n = Object.keys(store.get().academy.done).length;
        if (n >= 3) store.unlock('estudiante');
        if (n >= LESSONS.length) store.unlock('erudito');
        toast(`Lección completada: +${fmt(LESSON_REWARD)} fichas`, { type: 'gold', icon: '🎓' });
      }
      result.appendChild(h('div.feedback.good', h('strong', `${correct} de ${lesson.quiz.length}: ¡aprobado!`), first ? 'Has completado la lección.' : 'Ya tenías esta lección completada.'));
    } else {
      result.appendChild(h('div.feedback.bad', h('strong', `${correct} de ${lesson.quiz.length}`), 'Repasa la lección y vuelve a intentarlo.',
        h('div', { style: { marginTop: '10px' } }, h('button.btn.btn-ghost.btn-sm', { type: 'button', onclick: () => box.replaceWith(renderQuiz(lesson)) }, svgIcon('i-refresh'), 'Repetir el test'))));
    }
  };
  box.appendChild(result);
  return box;
}
