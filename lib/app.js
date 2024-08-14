'use strict';

const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const tc = require('timezonecomplete');
const sortify = require('./sortify.js');

const express = require('express');
const favicon = require('serve-favicon');
/*
const Mustache = require('mustache');
Mustache.escape = function (text) {
  console.log('ESCAPE!!!');
  if (/\[sound:.*\]/.test(text)) {
    console.log('matched');
    const src = [];
    for (const m of text.matchAll(/\[sound:(.*?)\]/g)) {
      src.push(m[1]);
    }
    let result = '<audio id="myaudio" autoplay controls></audio>';
    result += '<script>';
    result += 'var audioFiles = ["' + src.join('","') + '"];';
    result += '</script>';
    return result;
  } else {
    return text;
  }
};
*/

// let averageStudyTimePerCard = 0;

/**
 * Export a factory function that returns an instance of the srf express app.
 *
 */
module.exports = (srf, options = {}) => {
  if (!srf) {
    throw new Error('srf instance is required');
  }
  const opts = {
    ...srf.opts,
    ...options,
  };
  const app = express();
  app.use(favicon(path.join(__dirname, '..', 'public', 'favicon.ico')));
  const expressHandlebars = require('express-handlebars');
  const hbsFormHelper = require('handlebars-form-helper');
  const hbs = expressHandlebars.create({
    helpers: {
      json (context, indent = 0) {
        return JSON.stringify(context, null, indent);
      },
    },
  });
  hbsFormHelper.registerHelpers(hbs.handlebars, { namespace: 'form' });
  app.engine('handlebars', hbs.engine);
  if (opts.views && fs.existsSync(opts.views)) {
    app.set('views', [
      opts.views,
      path.join(__dirname, '..', 'views'),
    ]);
  } else {
    app.set('views', path.join(__dirname, '..', 'views'));
  }
  app.set('view engine', 'handlebars');
  if (opts.htdocs && fs.existsSync(opts.htdocs)) {
    app.use(express.static(opts.htdocs));
  }
  app.use(express.static(path.join(__dirname, '..', 'public')));
  // Anki templates use relative paths to media that are just the file name
  app.use('/card/:id', express.static(opts.media));
  app.use(express.json({ limit: '50MB' }));

  app.get('/', (req, res) => {
    const config = srf.getConfig();
    const now = Math.floor(Date.now() / 1000);
    const nextDue = srf.getNextDue() || now;

    const dueNow = srf.getCountCardsDueNow();
    const nextCard = srf.getNextCard();
    const statsPast24Hours = srf.getStatsPast24Hours();
    const statsNext24Hours = srf.getStatsNext24Hours();
    const overdue = srf.getCountCardsOverdue();
    const averageStudyTime = srf.getAverageStudyTime();

    const averageNewCards = srf.getAverageNewCardsPerDay();
    const chart1Data = srf.getChartStudyTime();
    const newCardsSeen = srf.getCountNewCardsPast24Hours();
    const mode = getMode(statsPast24Hours, statsNext24Hours);
    const studyNow = !!nextCard;
    const studyTime = Math.floor(
      (
        (statsPast24Hours.time + statsNext24Hours.time) / 2 +
        averageStudyTime
      ) / 2 / 60
    );
    statsPast24Hours.time = Math.floor(statsPast24Hours.time / 60);
    statsNext24Hours.time = Math.floor(statsNext24Hours.time / 60);
    res.render('home', {
      studyTime: studyTime,
      statsPast24Hours: statsPast24Hours,
      statsNext24Hours: statsNext24Hours,
      averageStudyTime: (averageStudyTime / 60).toFixed(0),
      averageNewCards: averageNewCards.toFixed(2),
      targetStudyTime: (config.targetStudyTime / 60).toFixed(0),
      percentCorrect: srf.getAveragePercentCorrect().toFixed(2),
      dueNow: dueNow,
      overdue: overdue,
      newCardsSeen: newCardsSeen,
      timeToNextDue: tc.seconds(nextDue - now).toFullString().slice(0, -4),
      studyNow: studyNow,
      chart1Data: JSON.stringify(chart1Data),
      mode: mode,
      theme: config.theme,
    });
  });

  app.get('/admin', (req, res) => {
    const config = srf.getConfig();
    res.render('admin', {
      theme: config.theme,
    });
  });

  app.get('/config', (req, res) => {
    const config = srf.getConfig();
    res.render('config', {
      theme: config.theme,
      config: JSON.parse(sortify(config)),
    });
  });

  app.get('/help', (req, res) => {
    res.render('help');
  });

  app.get('/stats', (req, res) => {
    const now = Math.floor(Date.now() / 1000);
    const studyTimeToday = srf.getStudyTimeToday();
    const cardsViewedToday = srf.getCountCardsViewedToday();
    const dueCount = srf.getCountCardsDueToday();
    const nextDue = srf.getNextDue() || now;
    const newCardsToday = srf.getCountNewCardsToday();
    const newCardsShortTermAverage = srf.getAverageNewCardsPerDay();
    const cardsSeen = srf.getCountCardsSeen();
    const days = srf.getCountDaysStudied();
    const newCardsLongTermAverage = (cardsSeen && days) ? cardsSeen / days : 0;

    const charts = srf.getChartsDailyStats();
    charts.chartCardsPerInterval = srf.getChartCardsPerInterval();
    charts.chartCardsPerLastInterval = srf.getChartCardsPerLastInterval();
    charts.chartCardsDuePerDay = srf.getChartCardsDuePerDay();

    const config = srf.getConfig();
    const averageStudyTime = srf.getAverageStudyTime();
    const statsNext24Hours = srf.getStatsNext24Hours();

    res.render('stats', {
      newCardsToday: newCardsToday,
      newCardsShortTermAverage: newCardsShortTermAverage.toFixed(2),
      newCardsLongTermAverage: newCardsLongTermAverage.toFixed(2),
      cardsSeen: cardsSeen,
      countUI: srf.getCountCardsStage0(),
      countCI: srf.getCountCardsStage1(),
      countCC: srf.getCountCardsStage2(),
      countUC: srf.getCountCardsStage3(),
      countM: srf.getCountCardsStage4(),
      percentCorrect: srf.getAveragePercentCorrect().toFixed(2),
      cardsViewedToday: cardsViewedToday,
      dueCount: dueCount,
      averageStudyTimePerReview: srf.getAverageStudyTimePerReview().toFixed(1),
      studyTimeToday: tc.seconds(studyTimeToday).toFullString().slice(0, -4),
      averageStudyTimePerDay: tc.seconds(averageStudyTime).toFullString().slice(0, -4),
      timeToNextDue: tc.seconds(nextDue - now).toFullString().slice(0, -4),
      charts: charts,
      theme: config.theme,
      statsNext24Hours: statsNext24Hours,
    });
  });

  app.get('/next', (req, res) => {
    const card = srf.getNextCard();
    if (card) {
      res.redirect('/card/' + card.id + '/front');
    } else {
      res.redirect('/');
    }
  });

  app.get('/studyNow', (req, res) => {
    const card = srf.getNextCard(true);
    if (card) {
      res.redirect('/card/' + card.id + '/front');
    } else {
      res.redirect('/');
    }
  });

  app.get('/new', (req, res) => {
    const card = srf.getNewCard();
    if (card) {
      res.redirect('/card/' + card.id + '/front');
    } else {
      res.redirect('/');
    }
  });

  app.get('/card/:id/front', (req, res) => {
    const cardid = parseInt(req.params.id);
    const card = srf.getCard(cardid);
    if (card) {
      const now = Math.floor(Date.now() / 1000);
      const cardStartTime = now;
      const timeCardLastSeen = srf.getTimeCardLastSeen(cardid);
      const timeSinceLastReview = timeCardLastSeen ? now - timeCardLastSeen : 0;
      const fields = srf.getFields(card.fieldsetid);
      const template = srf.getTemplate(card.templateid);
      card.template = template;
      card.front = srf.render(template.front, fields);
      fields.FrontSide = card.front;
      card.back = srf.render(template.back, fields);
      const dueNow = srf.getCountCardsDueNow();
      const statsPast24Hours = srf.getStatsPast24Hours();
      const statsNext24Hours = srf.getStatsNext24Hours();
      const config = srf.getConfig();
      const mode = getMode(statsPast24Hours, statsNext24Hours);
      statsPast24Hours.time = Math.floor(statsPast24Hours.time / 60);
      statsNext24Hours.time = Math.floor(statsNext24Hours.time / 60);
      const reviewsToNextNew = Math.max(
        0,
        statsNext24Hours.minReviews - statsNext24Hours.reviews
      );
      res.render('front', {
        card: card,
        timeSinceLastReview: srf.formatSeconds(timeSinceLastReview),
        interval: srf.formatSeconds(card.interval),
        front: card.front,
        template: template,
        cardStartTime: cardStartTime,
        mode: mode,
        theme: config.theme,
        statsPast24Hours: statsPast24Hours,
        statsNext24Hours: statsNext24Hours,
        reviewsToNextNew: reviewsToNextNew,
        maxViewTime: config.maxViewTime,
        dueNow: dueNow,
      });
    } else {
      res.redirect('/');
    }
  });

  app.get('/card/:id/back', (req, res) => {
    const cardStartTime = parseInt(req.query.startTime);
    const cardid = parseInt(req.params.id);
    const card = srf.getCard(cardid);
    if (card) {
      const now = Math.floor(Date.now() / 1000);
      const timeCardLastSeen = srf.getTimeCardLastSeen(cardid);
      const timeSinceLastReview = timeCardLastSeen ? now - timeCardLastSeen : 0;
      const fields = srf.getFields(card.fieldsetid);
      const template = srf.getTemplate(card.templateid);
      card.template = template;
      card.front = srf.render(template.front, fields);
      fields.FrontSide = card.front;
      card.back = srf.render(template.back, fields);
      const dueNow = srf.getCountCardsDueNow();
      const statsPast24Hours = srf.getStatsPast24Hours();
      const statsNext24Hours = srf.getStatsNext24Hours();
      const config = srf.getConfig();
      const mode = getMode(statsPast24Hours, statsNext24Hours);
      statsPast24Hours.time = Math.floor(statsPast24Hours.time / 60);
      statsNext24Hours.time = Math.floor(statsNext24Hours.time / 60);
      const intervals = srf.getIntervals(card);
      intervals.fail = srf.formatSeconds(intervals.fail);
      intervals.hard = srf.formatSeconds(intervals.hard);
      intervals.good = srf.formatSeconds(intervals.good);
      intervals.easy = srf.formatSeconds(intervals.easy);
      const reviewsToNextNew = Math.max(
        0,
        statsNext24Hours.minReviews - statsNext24Hours.reviews
      );
      const chartData = srf.getChartCardHistory(card.id);
      res.render('back', {
        card: card,
        timeSinceLastReview: srf.formatSeconds(timeSinceLastReview),
        interval: srf.formatSeconds(card.interval),
        back: card.back,
        template: card.template,
        cardStartTime: cardStartTime,
        mode: mode,
        theme: config.theme,
        statsPast24Hours: statsPast24Hours,
        statsNext24Hours: statsNext24Hours,
        reviewsToNextNew: reviewsToNextNew,
        maxViewTime: config.maxViewTime,
        intervals: intervals,
        dueNow: dueNow,
        chartData: chartData,
      });
    } else {
      res.redirect('/');
    }
  });

  // Responses to reviews are posted
  app.post('/card/:id', (req, res) => {
    const cardid = parseInt(req.params.id);
    const card = srf.getCard(cardid);
    const startTime = parseInt(req.body.startTime);
    const now = Math.floor(Date.now() / 1000);
    const viewTime = now - startTime;
    const studyTime =
      ((now - (req.app.locals.lastReviewTime || 0)) < 300)
        ? (now - req.app.locals.lastReviewTime)
        : viewTime;
    req.app.locals.lastReviewTime = now;
    const ease = req.body.ease;
    srf.reviewCard(card, viewTime, studyTime, ease);
    const nextCard = srf.getNextCard();
    res.json({ cardAvailable: !!nextCard });
  });

  app.get('/fieldsets', (req, res) => {
    const fieldsets = srf.getFieldsets();
    res.render('fieldsets', {
      fieldsets: fieldsets,
    });
  });

  app.get('/fieldset/:id', (req, res) => {
    const fieldset = srf.getFieldset(req.params.id);
    // To present a select of template sets the form helper needs an object
    // keyed by select value with value being the displayed text.
    const templatesets = {};
    srf.getTemplatesets().forEach(set => {
      templatesets[set.name] = set.name;
      // make sure the fieldset has all the fields in the templateset
      if (set.name === fieldset.templateset) {
        set.fields.forEach(field => {
          if (fieldset.fields[field] === undefined) {
            fieldset.fields[field] = '';
          }
        });
      }
    });
    res.render('fieldset', {
      fieldset: fieldset,
      templatesets: templatesets,
    });
  });

  app.get('/fieldset', (req, res) => {
    const fieldset = {
      id: 'new',
      guid: uuidv4(),
      ord: '0',
      templateset: '',
      fields: {},
    };
    fieldset.templateset = srf.getTemplatesets()[0].name;
    fieldset.templateset = srf.getTemplateset(fieldset.templateset);
    fieldset.templateset.fields.forEach(field => {
      fieldset.fields[field] = '';
    });
    // To present a select of template sets the form helper needs an object
    // keyed by select value with value being the displayed text.
    const templatesets = {};
    srf.getTemplatesets().forEach(set => {
      templatesets[set.name] = set.name;
    });
    res.render('fieldset', {
      fieldset: fieldset,
      templatesets: templatesets,
    });
  });

  app.post('/fieldset/:id', (req, res) => {
    if (req.params.id === 'new') {
      const templateset = req.body.templateset;
      const ord = req.body.ord;
      const fields = JSON.stringify(req.body.fields);
      srf.createFieldset(uuidv4(), templateset, ord, fields);
    } else {
      const fieldsetid = Number(req.params.id);
      const templateset = req.body.templateset;
      const ord = req.body.ord;
      const fields = JSON.stringify(req.body.fields);
      srf.updateFieldset(fieldsetid, templateset, ord, fields);
    }
    const files = req.body.files;
    if (files && files.length > 0) {
      files.forEach(file => {
        const filepath = path.join(opts.media, file.meta.name);
        const buff = Buffer.from(file.data.substring(23), 'base64');
        fs.writeFileSync(filepath, buff);
      });
    }
    res.send('ok');
  });

  app.get('/templatesets', (req, res) => {
    const templatesets = srf.getTemplatesets();
    res.render('templatesets', {
      templatesets: templatesets,
    });
  });

  app.get('/templateset/:id', (req, res) => {
    const templateset = srf.getTemplateset(req.params.id);
    res.render('templateset', templateset);
  });

  app.get('/templateset', (req, res) => {
    res.render('templateset', {
      id: 0,
      name: 'new',
      templatesJSON: '[]',
      fieldsJSON: '[]',
    });
  });

  app.get('/templates', (req, res) => {
    const templates = srf.getTemplates();
    res.render('templates', {
      templates: templates,
    });
  });

  app.get('/template/:id', (req, res) => {
    const template = srf.getTemplate(req.params.id);
    // To present a select of template sets the form helper needs an object
    // keyed by select value with value being the displayed text.
    const templatesets = {};
    srf.getTemplatesets().forEach(set => {
      templatesets[set.id] = set.name;
    });
    res.render('template', {
      template: template,
      templatesets: templatesets,
    });
  });

  app.get('/template', (req, res) => {
    const template = {
      id: 0,
      templatesetid: 0,
      name: '',
      front: '',
      back: '',
      css: '',
    };
    // To present a select of template sets the form helper needs an object
    // keyed by select value with value being the displayed text.
    const templatesets = {};
    srf.getTemplatesets().forEach(set => {
      templatesets[set.id] = set.name;
    });
    res.render('template', {
      template: template,
      templatesets: templatesets,
    });
  });

  app.post('/template/:id', (req, res) => {
    if (req.params.id === '0') {
      srf.createTemplate(
        req.body.templateset,
        req.body.name,
        req.body.front,
        req.body.back,
        req.body.css
      );
      res.send('ok');
    } else {
      srf.updateTemplate(
        req.body.templateset,
        req.body.name,
        req.body.front,
        req.body.back,
        req.body.css,
        req.params.id
      );
      res.send('ok');
    }
  });

  app.get('/rest/templateset/:id', (req, res) => {
    const templateset = srf.getTemplateset(req.params.id);
    res.send(templateset);
  });

  app.use((req, res, next) => {
    console.log('404 ', req.path);
    res.status(404).send('Not found');
  });

  function getMode (statsPast24Hours, statsNext24Hours) {
    return srf.getNewCardMode();
  }

  return app;
};
