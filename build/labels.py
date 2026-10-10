# Egne danske navne til Ciceros datafelter (skrevet til Beskedværkstedet, ikke fra USM0013).
# Opslag: først "forælder>felt", så "felt". Filial-, placerings-, låner- og postfelter navngives ud fra forælderen.

BRANCHES = {
    'branch': 'Lånerens filial', 'pickupBranch': 'Afhentningsfilial', 'activeBranch': 'Materialets aktuelle filial',
    'defaultBranch': 'Materialets hjemfilial', 'lastScannedBranch': 'Filial, hvor materialet sidst blev scannet',
}
BRANCH_CHILD = {
    'name': 'navn', 'shortName': 'kort navn', 'address': 'adresse', 'city': 'by', 'zipCode': 'postnummer', 'zipCodeF': 'postnummer',
    'phone': 'telefon', 'email': 'e-mail', 'website': 'hjemmeside', 'branchId': 'ISIL-kode', 'municipalityId': 'kommunenummer',
    'openingHours': 'åbningstider',
}
PLACES = {
    'activeDepartment': 'Aktuel afdeling', 'defaultDepartment': 'Fast afdeling', 'activeLocation': 'Aktuel opstilling',
    'defaultLocation': 'Fast opstilling', 'activeSection': 'Aktuel sektion', 'defaultSection': 'Fast sektion',
    'activeSublocation': 'Aktuel delopstilling', 'defaultSublocation': 'Fast delopstilling',
    'department': 'Temaets afdeling', 'location': 'Temaets opstilling', 'section': 'Temaets sektion', 'sublocation': 'Temaets delopstilling',
}
LOANER = {
    'name': 'Lånerens navn', 'email': 'Lånerens e-mail', 'emails': 'Lånerens e-mailadresser', 'phoneNumber': 'Lånerens telefonnummer',
    'phoneNumbers': 'Lånerens telefonnumre', 'addressStreet': 'Lånerens adresse', 'addressCity': 'Lånerens by', 'zipCode': 'Lånerens postnummer',
    'coName': 'Lånerens c/o-navn', 'country': 'Lånerens land', 'countryCode': 'Lånerens landekode',
    'secondaryAddressStreet': 'Lånerens anden adresse', 'secondaryAddressCity': 'Lånerens anden by', 'secondaryZipCode': 'Lånerens andet postnummer',
    'secondaryCoName': 'Lånerens andet c/o-navn', 'secondaryCountryCode': 'Lånerens anden landekode',
    'loanerNumber': 'Lånernummer', 'id': 'Lånerens interne id', 'personIdentifier': 'CPR-nummer', 'dateOfBirth': 'Fødselsdato',
    'gender': 'Køn', 'preferredLanguage': 'Foretrukket sprog', 'loanerGroups': 'Lånergrupper', 'branch': 'Lånerens filial',
    'loanerLibraryCardNumbers': 'Lånerkort', 'activeNonExpiredLibraryCardNumbers': 'Aktive lånerkort', 'blockedReason': 'Grund til blokering',
    'absenceFrom': 'Fravær fra', 'absenceTo': 'Fravær til', 'dateCreated': 'Oprettet', 'dateModified': 'Senest ændret',
    'internNote': 'Intern note om låneren', 'noteToPatron': 'Note til låneren', 'loanerInterests': 'Lånerens interesser',
    'isNameAndAddressProtection': 'Har navne- og adressebeskyttelse',
}
LOANER_LIKE = {'loaner': None, 'loanerModel': None, 'guardian': 'Værge', 'loanerToNotify': 'Låner, der får beskeden',
               'newLoaner': 'Ny låner', 'oldLoaner': 'Tidligere låner'}
RECORDS = {'record': None, 'bibliographicRecord': None, 'bibliographicRecordModel': None, 'reservationFeeBibliographicRecordData': 'Reserveret post'}
RECORD_CHILD = {'title': 'Titel', 'author': 'Forfatter', 'classification': 'Opstilling (DK5)', 'faust': 'Faustnummer', 'type': 'Materialetype'}

BASE = {
    # fælles
    'privacyPolicy': 'Privatlivspolitik (tekst)', 'agency': 'Biblioteket', 'agencyISIL': 'Bibliotekets ISIL-kode', 'protocol': 'Beskedform (EMAIL, SMS …)',
    'agencyName': 'Bibliotekets navn', 'loginBranchName': 'Filial, beskeden er sendt fra', 'loaner': 'Låneren', 'loanerModel': 'Låneren',
    'underageLoaner': 'Mindreårig låner', 'isUnderage': 'Er mindreårig', 'financialResponsibleName': 'Økonomisk ansvarlig – navn',
    'financialResponsibleAddressStreet': 'Økonomisk ansvarlig – adresse', 'financialResponsibleAddressCity': 'Økonomisk ansvarlig – by',
    'financialResponsibleZipCode': 'Økonomisk ansvarlig – postnummer', 'financialResponsibleCountry': 'Økonomisk ansvarlig – land',
    'guardian': 'Værge',
    # lånergrupper, e-mail, telefon
    'loanerGroupName': 'Gruppens navn', 'loanerGroupNameWithHierarchyPath': 'Gruppens fulde sti', 'loanerGroupNameWithRoot': 'Øverste niveau og gruppe',
    'loanerGroupNames': 'Lånergrupper', 'type': 'Type', 'number': 'Nummer',
    # åbningstider
    'openingHours': 'Åbningstider', 'day': 'Ugedag (1 = mandag)', 'open': 'Åben denne dag', 'openHoursStartTime': 'Åbner', 'openHoursEndTime': 'Lukker',
    'serviceHoursStartTime': 'Betjening fra', 'serviceHoursEndTime': 'Betjening til',
    # materialer og lån
    'material': 'Materialet', 'itemNumber': 'Materialenummer', 'materialNumber': 'Materialenummer', 'barcode': 'Stregkode',
    'acquisitionDate': 'Accessionsdato', 'group': 'Materialegruppe', 'note': 'Note om materialet', 'periodical': 'Er et periodikum',
    'periodicalName': 'Periodikanummer', 'periodicalInfo': 'Periodikanummer', 'activeFloatGroupName': 'Flydegruppe', 'theme': 'Tema',
    'record': 'Titlen (bibliografisk post)', 'loan': 'Lånet', 'loanDate': 'Udlånsdato', 'returnDate': 'Afleveringsdato', 'returnedDate': 'Afleveret',
    'checkoutDateAndTime': 'Udlånt (dato og tid)', 'checkinDateAndTime': 'Afleveret (dato og tid)', 'price': 'Materialets pris',
    'materialLoan': 'Lånet', 'activeMaterialLoans': 'Alle lånerens aktive lån', 'materialLoans': 'Lånene i beskeden',
    'loanTime': 'Udlånstid', 'materialCategory': 'Materialekategori', 'materialTypes': 'Materialetyper', 'combinedStatus': 'Status',
    'statusIndicator': 'Statusmarkering', 'status': 'Status', 'title': 'Titel', 'author': 'Forfatter', 'classification': 'Opstilling (DK5)',
    'faust': 'Faustnummer', 'faustNumber': 'Faustnummer', 'bibliographicRecord': 'Titlen (bibliografisk post)', 'bibliographicRecordModel': 'Titlen (bibliografisk post)',
    # reservationer
    'reservation': 'Reservationen', 'reservations': 'Reservationerne i beskeden', 'latestPickupDate': 'Afhentes senest',
    'dateOfInterest': 'Interessedato', 'notes': 'Note til reservationen', 'queueNumber': 'Nummer i køen', 'queueNo': 'Nummer i køen',
    'reservationPickupInformation': 'Afhentningsnummer', 'reservationPickupInformationr': 'Afhentningsnummer', 'pickupBranch': 'Afhentningsfilial',
    'activationDate': 'Aktiveret', 'createdTime': 'Oprettet', 'reservationType': 'Reservationstype',
    'daysBeforeSendingNotification': 'Dage før fristen, beskeden sendes',
    # mellemværender
    'fees': 'Ubetalte gebyrer', 'compensations': 'Ubetalte erstatninger', 'newFees': 'Nye gebyrer', 'newCompensations': 'Nye erstatninger',
    'amount': 'Beløb', 'balanceDate': 'Dato for det, der udløste beløbet', 'billNumber': 'Regningsnummer', 'migratedBillNumber': 'Gammelt regningsnummer',
    'createdDate': 'Oprettet', 'dueDate': 'Betalingsfrist', 'state': 'Status', 'text': 'Tekst', 'feeType': 'Gebyrtype',
    'transactions': 'Posteringer', 'transactionId': 'Posteringens id', 'parentTransactionId': 'Hovedposteringens id',
    'vatInformation': 'Moms', 'amountExclVat': 'Beløb uden moms', 'vatAmount': 'Moms (beløb)', 'vatRate': 'Momssats (%)',
    'reservationFeeBibliographicRecordData': 'Reserveret titel', 'sumOfFees': 'Gebyrer i alt', 'sumOfCompensations': 'Erstatninger i alt',
    'sumOfNewFees': 'Nye gebyrer i alt', 'sumOfNewCompensations': 'Nye erstatninger i alt', 'total': 'I alt', 'newTotal': 'Nyt beløb i alt',
    'daysUntilDue': 'Dage til betalingsfrist', 'reminderCount': 'Rykkernummer', 'sentToCollectionRulesApply': 'Kan sendes til inddrivelse',
    'loanerBlockNoticeAmountThreshold': 'Beløbsgrænse for blokering (kr.)', 'loanerBlockNoticeDays': 'Dage til blokering',
    'feesModel': 'Mellemværender', 'remainingAmount': 'Restbeløb', 'feeVatIncl': 'Gebyr inkl. moms', 'materialPriceInclVat': 'Materialepris inkl. moms',
    'billDate': 'Regningsdato', 'payDueDate': 'Betalingsfrist', 'acknowledgedByPatron': 'Kvitteret af låneren', 'comensationVerified': 'Erstatning godkendt',
    'sendToDebitorSystem': 'Sendt til debitorsystem', 'modifiedTime': 'Senest ændret',
    # lånerstatus og indsigt
    'loansModel': 'Lån', 'reservationsModel': 'Reservationer', 'pendingReservationsModel': 'Reservationer, der venter',
    'reservationsForPickupModel': 'Reservationer klar til afhentning', 'noOfLoans': 'Antal lån', 'noOfPendingReservations': 'Antal ventende reservationer',
    'noOfReservationsForPickup': 'Antal klar til afhentning', 'totalAmounts': 'Mellemværender i alt', 'totalRemainingAmounts': 'Restbeløb i alt',
    'loanerInsightModel': 'Indsigt', 'messages': 'Sendte beskeder', 'message': 'Beskedens tekst', 'messageId': 'Beskedens id', 'messageType': 'Beskedtype',
    'subject': 'Emne', 'recipientAddress': 'Modtager', 'numberOfFailures': 'Antal fejlede forsøg', 'municipalityModel': 'Kommune',
    'homeboundDeliveryModel': 'Biblioteket Kommer', 'homeboundDeliveryActive': 'Biblioteket Kommer er aktiv', 'homeboundDeliveryNote': 'Note (Biblioteket Kommer)',
    'homeboundDeliveryPreferences': 'Ønsker (Biblioteket Kommer)', 'homeboundDeliveryResponsible': 'Ansvarlig (Biblioteket Kommer)',
    'homeboundDeliveryRoute': 'Rute (Biblioteket Kommer)', 'homeboundParticipationEndDate': 'Biblioteket Kommer slutter',
    # udlånskvittering
    'receiptModel': 'Kvitteringen', 'branchName': 'Filialens navn', 'autoloan': 'Udlånt i automat', 'checkedOutMaterials': 'Udlånte materialer',
    'renewed': 'Er fornyet', 'ILLRenewedTentatively': 'Fjernlån foreløbigt fornyet', 'fulfilledReservationNote': 'Note om opfyldt reservation',
    'loanerSummary': 'Låneroversigt', 'primaryLoanerLoanerSummary': 'Låneroversigt for hovedlåner', 'balance': 'Saldo', 'loanerName': 'Lånerens navn',
    'loanerLibraryCardNumber': 'Lånerkort', 'nextReturnDate': 'Næste afleveringsdato', 'numberOfLateMaterials': 'Antal overskredne lån',
    'numberOfLoans': 'Antal lån', 'numberOfReservedReady': 'Antal klar til afhentning', 'nrLendoutMaterials': 'Antal udlånte', 'nrRenewedMaterials': 'Antal fornyede',
    # booking
    'expectedDeliveryDate': 'Forventet levering',
    # velkomst / adgangskode / pinkode
    'branch': 'Filialen', 'passwordExpirationHours': 'Linket virker i (timer)', 'url': 'Link til ny adgangskode', 'uuid': 'Engangskode',
    'pincodeExpiration': 'Pinkode-link udløber',
    # medlemskab
    'currentDate': 'Dags dato', 'currentMembership': 'Nuværende medlemskab', 'nextMembership': 'Næste medlemskab', 'numberOfDaysBeforeExpiration': 'Dage før udløb',
    'membershipChangeDate': 'Medlemskabet skifter', 'category': 'Kategori', 'endDate': 'Slutdato', 'paymentMethod': 'Betalingsform',
    'period': 'Periode', 'timeUnit': 'Tidsenhed', 'value': 'Antal', 'rates': 'Takster', 'rate': 'Takst', 'ageFrom': 'Alder fra', 'ageTo': 'Alder til',
    # CMS / økonomisk ansvarlig
    'name': 'Navn', 'loanerPreferredLanguage': 'Lånerens sprog', 'loanerLibraryCardNumbers': 'Lånerkort',
    # manuel besked / servicebesked
    'customNotification': 'Beskeden',
    # leverandør og periodika
    'agreedDeliveryTimeInDays': 'Leveringstid (dage)', 'billingAddressCity': 'Fakturaadresse – by', 'billingAddressCountry': 'Fakturaadresse – land',
    'billingAddressStreet': 'Fakturaadresse', 'billingAddressZip': 'Fakturaadresse – postnummer', 'contactPersonEmail': 'Kontaktpersonens e-mail',
    'contactPersonName': 'Kontaktpersonens navn', 'customerNumber': 'Kundenummer', 'daysToFirstReminder': 'Dage til første rykker',
    'deliveryAddressCity': 'Leveringsadresse – by', 'deliveryAddressCountry': 'Leveringsadresse – land', 'deliveryAddressStreet': 'Leveringsadresse',
    'deliveryAddressZip': 'Leveringsadresse – postnummer', 'description': 'Beskrivelse', 'discountPercentage': 'Rabat (%)', 'materialType': 'Materialetype',
    'maxNumberOfReminders': 'Højst antal rykkere', 'reminderPeriodeInDays': 'Dage mellem rykkere', 'supplierName': 'Leverandørens navn',
    'latePeriodicals': 'Forsinkede periodika', 'numberOfMissingMaterials': 'Antal manglende',
    # diverse
    'loanerGroups': 'Lånergrupper', 'loanerNumber': 'Lånernummer', 'noteToPatron': 'Note til låneren',
    'address': 'Adresse', 'email': 'E-mail', 'emails': 'E-mailadresser', 'phoneNumbers': 'Telefonnumre', 'country': 'Land',
}

CTX = {
    'data>name': 'Navn', 'agency>name': 'Bibliotekets navn', 'category>name': 'Kategoriens navn', 'theme>name': 'Temaets navn',
    'latePeriodicals>name': 'Periodikummets titel', 'customNotification>title': 'Beskedens overskrift', 'customNotification>message': 'Beskedens tekst',
    'messages>loaner': 'Låneren', 'messages>agency': 'Biblioteket', 'messages>protocol': 'Beskedform', 'messages>status': 'Status', 'messages>country': 'Land',
    'feesModel>status': 'Status', 'feesModel>note': 'Note', 'feesModel>title': 'Titel', 'feesModel>type': 'Type',
    'emails>address': 'E-mailadresse', 'emails>type': 'Type (fx HOME)', 'phoneNumbers>number': 'Telefonnummer', 'phoneNumbers>type': 'Type (fx CELL_PHONE)',
    'municipalityModel>number': 'Kommunenummer', 'transactions>type': 'Posteringstype', 'transactions>amount': 'Beløb', 'transactions>createdDate': 'Oprettet',
    'fees>materialLoans': 'Lån, gebyret gælder', 'newFees>materialLoans': 'Lån, gebyret gælder', 'fees>loanDate': 'Udlånsdato for lånene',
    'newFees>loanDate': 'Udlånsdato for lånene', 'compensations>materialLoan': 'Lånet, erstatningen gælder', 'newCompensations>materialLoan': 'Lånet, erstatningen gælder',
    'compensations>returnDate': 'Lånets afleveringsdato', 'fees>returnDate': 'Lånets afleveringsdato', 'newFees>returnDate': 'Lånets afleveringsdato',
    'newCompensations>returnDate': 'Lånets afleveringsdato', 'checkedOutMaterials>materialLoan': 'Lånet',
    'data>reservation': 'Reservationen', 'reservations>reservation': 'Reservationen', 'reservation>reservation': 'Reservationen',
    'reservations>record': 'Titlen (bibliografisk post)', 'data>material': 'Materialet', 'data>record': 'Titlen (bibliografisk post)',
    'data>branch': 'Filialen', 'data>itemNumber': 'Materialenummer', 'data>periodicalName': 'Periodikanummer',
    'latePeriodicals>periodicalName': 'Nummer', 'latePeriodicals>periodical': 'Er et periodikum', 'latePeriodicals>expectedDeliveryDate': 'Forventet levering',
    'data>loanerName': 'Lånerens navn', 'data>loanerLibraryCardNumbers': 'Lånerens lånerkort', 'guardian>name': 'Værgens navn',
    'guardian>preferredLanguage': 'Værgens sprog', 'loanerSummary>preferredLanguage': 'Lånerens sprog', 'primaryLoanerLoanerSummary>preferredLanguage': 'Hovedlånerens sprog',
    'theme>department': 'Temaets afdeling', 'theme>location': 'Temaets opstilling', 'theme>section': 'Temaets sektion', 'theme>sublocation': 'Temaets delopstilling',
    'material>note': 'Note om materialet', 'material>group': 'Materialegruppe', 'material>periodicalName': 'Periodikanummer',
    'checkedOutMaterials>periodicalName': 'Periodikanummer', 'loansModel>title': 'Titel', 'loansModel>author': 'Forfatter',
}


def label(name, parent, grand=None):
    if parent in BRANCHES and name in BRANCH_CHILD:
        return BRANCHES[parent] + ' – ' + BRANCH_CHILD[name]
    if parent in PLACES and name in ('name', 'shortName'):
        return PLACES[parent] + (' – navn' if name == 'name' else ' – kort navn')
    if parent in LOANER_LIKE and name in LOANER:
        pre = LOANER_LIKE[parent]
        if not pre:
            return LOANER[name]
        word = LOANER[name].replace('Lånerens ', '')
        return pre + ': ' + word[0].lower() + word[1:]
    if parent in RECORDS and name in RECORD_CHILD:
        pre = RECORDS[parent]
        return (pre + ': ' + RECORD_CHILD[name].lower()) if pre else RECORD_CHILD[name]
    if name in BRANCHES and parent not in ('data',):
        return BRANCHES[name]
    if name in PLACES:
        return PLACES[name]
    if name in LOANER_LIKE and LOANER_LIKE[name]:
        return LOANER_LIKE[name]
    k = parent + '>' + name
    if k in CTX:
        return CTX[k]
    return BASE.get(name)
