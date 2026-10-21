/* Katalog over Ciceros notifikationer: hvilke datafelter der findes i hvilke beskedtyper (Cicero 1.54.0).
   Feltnavnene er Beskedværkstedets egne. Testdata er opdigtede. Kræver window.CATALOG_RAW (kompakt JSON). */
(function (root) {
  'use strict';

  // Kendte interne typenavne (@ftlvariable) -> afsnit i USM0013. Udvides med brugerens egne via indstillinger.
  const KNOWN_FTL_TYPES = {
    ReservationOnShelfApproachingDateExpirationDataModel: '3.24',
    ReturnDateExceededReminderDataModel: '3.27',
    LoanerCreatedDataModel: '3.9',
    AutoblockLoanerNotificationModel: '3.1',
    IllRenewRejectedDataModel: '3.8'
  };

  const PROTOCOLS = {
    EMAIL: { label: 'E-mail', format: 'text', subject: true },
    SMS: { label: 'SMS', format: 'text', subject: false },
    DIGITAL_POST: { label: 'Digital Post', format: 'html', subject: true },
    PHYSICAL_LETTER: { label: 'Brev', format: 'html', subject: true },
    CUSTOM: { label: 'Brugerdefineret', format: 'text', subject: true }
  };

  function load(raw) {
    const S = raw.s;
    const types = raw.types.map((t) => {
      const fields = [];
      for (const r of t.r) {
        const parent = r[0] >= 0 ? fields[r[0]] : null;
        const path = (parent ? parent.path : 'data') + '.' + r[1];
        const f = { path, name: r[1], desc: S[r[2]], ex: S[r[3]], flags: r[4], parent, children: [] };
        f.isList = r[4].includes('L');
        f.isObj = r[4].includes('C');
        f.isDate = r[4].includes('D');
        f.isNum = r[4].includes('N');
        f.isBool = r[4].includes('B');
        if (parent) parent.children.push(f);
        fields.push(f);
      }
      const byPath = {};
      fields.forEach((f) => { byPath[f.path] = f; });
      const top = fields.filter((f) => !f.parent);
      const type = { id: t.id, title: t.t, cat: t.c, protocols: t.p, keys: t.k || {}, other: t.o || [], fields, byPath, top };
      // find de "låner-agtige" stier for denne type
      const inList = (f) => { for (let p = f.parent; p; p = p.parent) if (p.isList) return true; return false; };
      const shortest = (re) => fields.filter((f) => re.test(f.name) && !inList(f)).sort((a, b) => a.path.length - b.path.length)[0];
      type.paths = {
        lang: (shortest(/^(preferredLanguage|loanerPreferredLanguage)$/) || {}).path || null,
        groups: (shortest(/^loanerGroups$/) || {}).path || null,
        dob: (shortest(/^dateOfBirth$/) || {}).path || null,
        underage: (shortest(/^isUnderage$/) || {}).path || null,
        name: (() => {
          const l = shortest(/^(loaner|loanerModel|loanerToNotify|loanerInfo)$/);
          if (l && byPath[l.path + '.name']) return l.path + '.name';
          const alt = shortest(/^(loanerName|contactPersonName|supplierName)$/) || (byPath['data.name'] ? byPath['data.name'] : null);
          return alt ? alt.path : null;
        })()
      };
      return type;
    });
    const byId = {};
    types.forEach((t) => { byId[t.id] = t; });
    return { types, byId };
  }

  // ---------- Testdata (egne, fiktive værdier) ----------
  const TITLES = ['Zappa', 'Ternet Ninja', 'Harry Potter og De Vises Sten', 'Kongens Fald', 'Hvad skal vi lave i dag?', 'Den grimme ælling'];
  const AUTHORS = ['Bjarne Reuter', 'Anders Matthesen', 'J.K. Rowling', 'Johannes V. Jensen', '', 'H.C. Andersen'];
  const CLASSES = ['86', 'sk', '79.41', '83.8', '', '86'];
  const DAY_OFFSETS = {
    returnDate: 3, loanDate: -25, checkoutDateAndTime: -25, latestPickupDate: 2, dateOfInterest: 60, dueDate: 30,
    createdDate: -1, balanceDate: -1, expectedDeliveryDate: 7, returnedDate: -1, acquisitionDate: -900, dateCreated: -400,
    dateModified: -3, checkinDateAndTime: 0, currentDate: 0, membershipChangeDate: 30, pincodeExpiration: 1, nextReturnDate: 3,
    endDate: 30, activationDate: -10, createdTime: -10, billDate: -1, payDueDate: 30, modifiedTime: -1, loanTime: -25,
    homeboundParticipationEndDate: 180
  };
  const NUMBERS = {
    amount: 25, amountExclVat: 20, vatAmount: 5, vatRate: 25, price: 249.95, balance: 25, daysUntilDue: 30, reminderCount: 1,
    loanerBlockNoticeAmountThreshold: 200, loanerBlockNoticeDays: 14, queueNumber: 2, daysBeforeSendingNotification: 2,
    passwordExpirationHours: 24, numberOfDaysBeforeExpiration: 14, agreedDeliveryTimeInDays: 14, daysToFirstReminder: 30,
    maxNumberOfReminders: 3, reminderPeriodeInDays: 14, discountPercentage: 10, numberOfMissingMaterials: 1, numberOfFailures: 0
  };
  const TEXTS = {
    privacyPolicy: 'Læs om, hvordan vi behandler dine oplysninger, på bibliotekets hjemmeside.',
    agencyISIL: 'DK-700000', branchId: 'DK-700001', municipalityId: '999', shortName: 'HB', website: 'https://bibliotek.example.dk',
    phone: '70 00 00 00', city: 'Bøgevang', zipCode: '4321', zipCodeF: '4321', address: 'Biblioteksvej 1',
    addressStreet: 'Kastanievej 12', addressCity: 'Bøgevang', coName: '', country: 'Danmark', countryCode: 'DK',
    secondaryAddressStreet: '', secondaryAddressCity: '', secondaryZipCode: '', secondaryCoName: '', secondaryCountryCode: '',
    email: 'sofie.lund@example.dk', phoneNumber: '12 34 56 78', loanerNumber: 'L0001234', id: '1001', personIdentifier: '0000000000',
    gender: 'UNKNOWN', blockedReason: 'Ubetalte gebyrer', internNote: '', noteToPatron: '', loanerInterests: '',
    feeType: 'OVERDUE_LOAN', state: 'CREATED', text: 'For sen aflevering', billNumber: '100234', migratedBillNumber: '',
    transactionId: '1', parentTransactionId: '', group: '14 dages lån', barcode: '5163870', note: '', notes: '',
    activeFloatGroupName: 'Voksen', faust: '12345678', faustNumber: '12345678', type: 'bog', materialType: 'Bøger',
    loginBranchName: 'Hovedbiblioteket', branchName: 'Hovedbiblioteket', loanerName: 'Sofie Lund', supplierName: 'Bogleverandøren A/S',
    contactPersonName: 'Jonas Holm', contactPersonEmail: 'jonas@example.dk', customerNumber: '4711', description: 'Skønlitteratur',
    url: 'https://bibliotek.example.dk/nulstil?kode=abc123', uuid: 'abc123', protocol: 'EMAIL',
    loanerPreferredLanguage: 'da', reservationType: 'NORMAL', status: 'OK', subject: 'Besked fra biblioteket', message: 'Eksempel på en besked fra biblioteket.',
    paymentMethod: 'Betalingskort', timeUnit: 'MONTH', value: '12', rate: '0', ageFrom: '0', ageTo: '17',
    billingAddressStreet: 'Rådhustorvet 1', billingAddressCity: 'Bøgevang', billingAddressZip: '4321', billingAddressCountry: 'Danmark',
    financialResponsibleName: 'Anne Lund', financialResponsibleAddressStreet: 'Kastanievej 12', financialResponsibleAddressCity: 'Bøgevang',
    financialResponsibleZipCode: '4321', financialResponsibleCountry: 'Danmark', combinedStatus: 'Udlånt', statusIndicator: '', materialCategory: 'Bog',
    materialTypes: 'Bog', remainingAmount: '25,00', totalRemainingAmounts: '25,00', feeVatIncl: '25,00', materialPriceInclVat: '249,95',
    acknowledgedByPatron: 'false', comensationVerified: 'false', sendToDebitorSystem: 'false', fulfilledReservationNote: '',
    nrLendoutMaterials: '2', nrRenewedMaterials: '0', pickupBranch: 'Bøgevang Bibliotek', homeboundDeliveryNote: '', homeboundDeliveryPreferences: '',
    homeboundDeliveryResponsible: '', homeboundDeliveryRoute: '', messageId: '1', messageType: 'EMAIL', recipientAddress: 'sofie.lund@example.dk',
    number: '999',
    deliveryAddressStreet: 'Biblioteksvej 1', deliveryAddressCity: 'Bøgevang', deliveryAddressZip: '4321', deliveryAddressCountry: 'Danmark'
  };
  const BRANCH_NAMES = { branch: 'Hovedbiblioteket', pickupBranch: 'Bøgevang Bibliotek', activeBranch: 'Hovedbiblioteket', defaultBranch: 'Hovedbiblioteket', lastScannedBranch: 'Bøgevang Bibliotek' };
  const PLACE_NAMES = { name: 'Voksen', shortName: 'VO' };
  const PERSON_NAMES = { loaner: 'Sofie Lund', loanerModel: 'Sofie Lund', loanerToNotify: 'Sofie Lund', newLoaner: 'Mads Krogh', oldLoaner: 'Sofie Lund', guardian: 'Anne Lund' };

  function addDays(base, n) { const d = new Date(base); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + n); return d; }

  function buildData(type, o) {
    o = Object.assign({ count: 2, lang: 'da', groups: ['Voksne'], child: false, periodical: false, libraryName: '', protocol: 'EMAIL', now: new Date() }, o || {});
    const libName = o.libraryName || 'Bøgevang Bibliotekerne';
    const listItemCount = (f, depth) => {
      if (/openingHours$/.test(f.name)) return 7;
      if (/^loanerGroups$/.test(f.name)) return o.groups.length;
      if (!f.children.length) return depth > 0 ? 1 : 2;
      return depth > 0 ? Math.min(o.count, 2) : o.count;
    };
    function value(f, i, depth, ctx) {
      const n = f.name;
      const par = f.parent ? f.parent.name : 'data';
      if (f.isList) {
        const k = listItemCount(f, depth);
        const arr = [];
        for (let j = 0; j < k; j++) {
          if (!f.children.length) arr.push(/Card/i.test(n) ? String(1234567890 + j) : /GroupNames/.test(n) ? (o.groups[j] || 'Voksne') : 'Eksempel ' + (j + 1));
          else arr.push(obj(f, j, depth + 1, { list: f, idx: j }));
        }
        return arr;
      }
      if (f.isObj || f.children.length) return obj(f, i, depth, ctx);
      // særtilfælde, der styres fra testdata-panelet
      if (/^(preferredLanguage|loanerPreferredLanguage)$/.test(n)) return o.lang;
      if (n === 'dateOfBirth') return o.child ? addDays(o.now, -9 * 365 - 40) : new Date(1985, 2, 15, 12);
      if (n === 'isUnderage') return !!o.child;
      const isPer = Array.isArray(o.periodical) ? o.periodical.includes(ctx && ctx.list ? ctx.idx : 0) : !!o.periodical;
      if (n === 'periodical') return isPer;
      if (n === 'periodicalName' || n === 'periodicalInfo') return isPer ? 'Nr. 8, 2026' : undefined;
      if (n === 'absenceFrom' || n === 'absenceTo') return undefined;
      if (n === 'protocol') return o.protocol;
      if (ctx && ctx.groups) {
        const g = o.groups[ctx.idx] || '';
        const parts = g.split('/').map((s) => s.trim()).filter(Boolean);
        if (n === 'loanerGroupName') return parts[parts.length - 1] || '';
        if (n === 'loanerGroupNameWithHierarchyPath') return parts.join('/');
        if (n === 'loanerGroupNameWithRoot') return parts.length > 1 ? parts[0] + '/' + parts[parts.length - 1] : parts[0] || '';
      }
      if (ctx && ctx.hours) {
        const day = ctx.idx + 1;
        const closed = day === 7;
        if (n === 'day') return day;
        if (n === 'open') return !closed;
        if (n === 'openHoursStartTime') return closed ? '' : '08:00';
        if (n === 'openHoursEndTime') return closed ? '' : (day === 6 ? '16:00' : '21:00');
        if (n === 'serviceHoursStartTime') return closed ? '' : '10:00';
        if (n === 'serviceHoursEndTime') return closed ? '' : (day >= 5 ? '14:00' : '17:00');
      }
      const idx = ctx && ctx.list ? ctx.idx : 0;
      if (n === 'title') return par === 'customNotification' ? 'Ændrede åbningstider' : isPer && Array.isArray(o.periodical) ? 'Læsehesten' : TITLES[idx % TITLES.length];
      if (n === 'author') return isPer && Array.isArray(o.periodical) ? '' : AUTHORS[idx % AUTHORS.length];
      if (n === 'classification') return CLASSES[idx % CLASSES.length];
      if (n === 'itemNumber' || n === 'materialNumber' || n === 'barcode') return String(5163870 + idx * 4711);
      if (n === 'reservationPickupInformation' || n === 'reservationPickupInformationr') return String(3 + idx * 14);
      if (n === 'queueNo') return String(2 + idx);
      if (n === 'name') {
        if (par === 'agency') return libName;
        if (BRANCH_NAMES[par]) return BRANCH_NAMES[par];
        if (PERSON_NAMES[par]) return PERSON_NAMES[par];
        if (PLACE_NAMES[n] && /Department|Location|Section|Sublocation|^department$|^location$|^section$|^sublocation$/.test(par)) return PLACE_NAMES[n];
        if (par === 'theme') return 'Krimiens år';
        if (par === 'category') return 'Standard';
        if (par === 'latePeriodicals') return 'Bogmagasinet';
        return 'Jonas Holm';
      }
      if (n === 'agencyName') return libName;
      if (n === 'address' && par === 'emails') return TEXTS.email;
      if (n === 'type' && par === 'emails') return 'HOME';
      if (n === 'type' && par === 'phoneNumbers') return 'CELL_PHONE';
      if (n === 'number' && par === 'phoneNumbers') return '+4512345678';
      if (n === 'email' && BRANCH_NAMES[par]) return 'bibliotek@example.dk';
      if (n === 'shortName' && /Department|Location|Section|Sublocation/.test(par)) return PLACE_NAMES.shortName;
      if (f.isDate) {
        if (DAY_OFFSETS[n] != null) return addDays(o.now, DAY_OFFSETS[n] + (n === 'latestPickupDate' ? idx : 0));
        return addDays(o.now, 0);
      }
      if (f.isBool) return n === 'open';
      if (f.isNum || n in NUMBERS) return NUMBERS[n] != null ? NUMBERS[n] : 1;
      if (n in TEXTS) return TEXTS[n];
      return '‹' + (f.desc || n) + '›';
    }
    function obj(f, i, depth, ctx) {
      const out = {};
      const sub = { list: ctx && ctx.list, idx: ctx ? ctx.idx : i, groups: /^loanerGroups$/.test(f.name), hours: /^openingHours$/.test(f.name) };
      if (!sub.groups && !sub.hours && ctx && (ctx.groups || ctx.hours)) { sub.groups = ctx.groups; sub.hours = ctx.hours; }
      for (const c of f.children) {
        const v = value(c, i, depth, sub);
        if (v !== undefined) out[c.name] = v;
      }
      return out;
    }
    const data = {};
    for (const f of type.top) {
      const v = value(f, 0, 0, null);
      if (v !== undefined) data[f.name] = v;
    }
    // summer, så tallene hænger sammen
    for (const [list, sum] of [['fees', 'sumOfFees'], ['compensations', 'sumOfCompensations'], ['newFees', 'sumOfNewFees'], ['newCompensations', 'sumOfNewCompensations']]) {
      if (Array.isArray(data[list]) && sum in data) data[sum] = +data[list].reduce((a, x) => a + (x.amount || 0), 0).toFixed(2);
    }
    if ('total' in data && 'sumOfFees' in data) data.total = +((data.sumOfFees || 0) + (data.sumOfCompensations || 0)).toFixed(2);
    return data;
  }

  const api = { load, buildData, KNOWN_FTL_TYPES, PROTOCOLS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CAT = api;
})(typeof window !== 'undefined' ? window : globalThis);
