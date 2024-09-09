const puppeteer = require('puppeteer');
const cheerio = require('cheerio');

const FST_URL = 'http://resultats.una.mr/FST/';

// Parsing student info from HTML
const parseStudentInfo = (html) => {
    const $ = cheerio.load(html);
    const notesArray = [];

    $("td span.couleurTetx1").each((index, element) => {
        notesArray.push($(element).text().trim());
    });

    if (notesArray[0]?.startsWith('Etudiant inexistant')) {
        return null;
    }

    const formattedResult = {
        "Profil d'orientation": isNaN(Number(notesArray[1]?.slice(0, 1))) ?
            (notesArray[2]?.trim() !== '' ? notesArray[2] : notesArray[0]) :
            notesArray[1],
        Name: isNaN(Number(notesArray[1]?.slice(0, 1))) ?
            notesArray[1] :
            notesArray[0],
        Profil: notesArray[2] || '',
    };

    return formattedResult.Name ? formattedResult : null;
};

// Retrieve notes for all semesters of a student
const getStudentNote = async (page) => {
    return await page.evaluate(() => {
        const semesterNotes = {};
        const dropdownSelector = "select[name='ecriture:j_id125']";
        const select = document.querySelector(dropdownSelector);
        const semesters = select ? Array.from(select.options).map(option => option.value) : [];

        const parseStudentNotes = () => {
            const modules = [];
            const modulesInfo = {
                moyen: "",
                decision: "",
                totalCredit: "",
            };

            const modulesinfos = Array.from(document.querySelectorAll('tfoot td span.couleurTetx1')).map(el => el.textContent.trim());
            if (modulesinfos.length >= 4) {
                modulesInfo.moyen = modulesinfos[0];
                modulesInfo.totalCredit = modulesinfos[1];
                modulesInfo.decision = modulesinfos[2];
            }

            document.querySelectorAll('tbody[id="ecriture:j_id171:tb"] > tr').forEach(row => {
                const module = {
                    id: "",
                    moyenModule: "",
                    decisionModule: "",
                    matieres: []
                };

                const moduleFooter = row.querySelector('tfoot');
                module.id = moduleFooter.querySelector('td span.couleurTetx').textContent.trim().replace('Moyenne Module', '');
                const footerSpans = moduleFooter.querySelectorAll('td span.couleurTetx1');
                module.moyenModule = footerSpans[1]?.textContent.trim() || '';
                module.decisionModule = footerSpans[2]?.textContent.trim() || '';

                row.querySelectorAll('tbody tr').forEach(tr => {
                    const spans = tr.querySelectorAll('td span.couleurTetx1');
                    const matiere = {
                        name: spans[0]?.textContent.trim() || '',
                        credit: parseFloat(spans[1]?.textContent.replace(",", ".")) || 0,
                        noteTP: parseFloat(spans[2]?.textContent.replace(",", ".")) || 0,
                        noteCC: parseFloat(spans[3]?.textContent.replace(",", ".")) || 0,
                        noteFinalCheck: parseFloat(spans[4]?.textContent.replace(",", ".")) || 0,
                        noteCatchup: parseFloat(spans[5]?.textContent.replace(",", ".")) || 0,
                        noteFinal: parseFloat(spans[6]?.textContent.replace(",", ".")) || 0,
                        decision: spans[7]?.textContent.trim() || ''
                    };
                    if (matiere.name && matiere.decision) {
                        module.matieres.push(matiere);
                    }
                });
                modules.push(module);
            });

            return {
                modules,
                modulesInfo
            };
        };

        for (let semester of semesters) {
            if (!semester) continue;

            const select = document.querySelector(dropdownSelector);
            select.value = semester;
            const event = new Event('change', { bubbles: true });
            select.dispatchEvent(event);

            // Wait for the page to update
            return new Promise(resolve => {
                setTimeout(() => {
                    const parsedNotes = parseStudentNotes();
                    if (parsedNotes.modules.length > 0) {
                        semesterNotes[semester] = parsedNotes;
                    }
                    resolve(semesterNotes);
                }, 1000); // Adjust timeout as needed
            });
        }

        return semesterNotes;
    });
};

// Process individual student data
const processStudent = async (id, browser) => {
    const page = await browser.newPage();

    try {
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            if (['image', 'stylesheet', 'font'].includes(req.resourceType())) {
                req.abort();
            } else {
                req.continue();
            }
        });

        await page.goto(FST_URL, { waitUntil: 'networkidle2' });
        await page.setViewport({ width: 1080, height: 1024 });

        await page.$eval("input[type='text'].rsinputTetx", el => el.value = "");
        await page.type("input[type='text'].rsinputTetx", `C${id}`);
        await Promise.all([page.keyboard.press("Enter"), page.waitForNavigation({ waitUntil: 'networkidle2' })]);

        const html = await page.content();
        const studentInfo = parseStudentInfo(html);

        if (!studentInfo) {
            console.log(`Student with ID C${id} not found.`);
            return null;
        }

        const semesterNotes = await getStudentNote(page);

        if (Object.keys(semesterNotes).length === 0) {
            console.log(`No semester data found for student ID C${id}.`);
            return null;
        }

        return {
            id: `C${id}`,
            Name: studentInfo.Name,
            "Profil d'orientation": studentInfo["Profil d'orientation"],
            Profil: studentInfo.Profil,
            semesters: semesterNotes
        };
    } catch (error) {
        console.error(`Error processing student ID C${id}: ${error.message}`);
        return null;
    } finally {
        await page.close();
    }
};

// Main function to orchestrate scraping
const getStudentNotes = async (studentId) => {
    if (!studentId || isNaN(parseInt(studentId, 10))) {
        throw new Error('Invalid student ID. Please provide a valid numeric ID.');
    }

    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--dns-prefetch-disable'],
        defaultViewport: null,
    });

    try {
        const studentDetails = await processStudent(studentId, browser);

        if (!studentDetails) {
            throw new Error(`Unable to retrieve data for student ID C${studentId}`);
        }

        return studentDetails;
    } finally {
        await browser.close();
    }
};

const scrapeMultipleStudents = async (ids) => {
    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--dns-prefetch-disable'],
        defaultViewport: null,
    });
    
    try {
        const results = await Promise.all(ids.map(id => processStudent(id, browser)));
        return results.filter(result => result !== null);
    } finally {
        await browser.close();
    }
};

module.exports = { getStudentNotes, scrapeMultipleStudents };
