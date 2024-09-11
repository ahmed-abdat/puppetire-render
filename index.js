const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
require('dotenv').config();

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
    try {
        await page.waitForSelector("select[name='ecriture:j_id125']", { visible: true, timeout: 30000 });

        const semesters = await page.evaluate(() => {
            const select = document.querySelector("select[name='ecriture:j_id125']");
            return select ? Array.from(select.options).map(option => option.value) : [];
        });

        console.log('Semesters found:', semesters);

        const semesterNotes = {};

        for (let semester of semesters) {
            if (!semester) continue;

            await page.select("select[name='ecriture:j_id125']", semester);
            await new Promise(resolve => setTimeout(resolve, 1000));

            const parsedNotes = await page.evaluate(() => {
                const modules = [];
                const modulesInfo = {
                    moyen: "",
                    decision: "",
                    totalCredit: "",
                };

                const modulesInfoSpans = document.querySelectorAll('tfoot td span.couleurTetx1');
                if (modulesInfoSpans.length >= 4) {
                    modulesInfo.moyen = modulesInfoSpans[0].textContent.trim();
                    modulesInfo.totalCredit = `${modulesInfoSpans[2].textContent.trim()}/${modulesInfoSpans[3].textContent.trim()}`;
                    modulesInfo.decision = modulesInfoSpans[4].textContent.trim();
                }

                document.querySelectorAll('tbody[id="ecriture:j_id171:tb"] > tr').forEach(row => {
                    const module = {
                        id: "",
                        moyenModule: "",
                        decisionModule: "",
                        matieres: []
                    };

                    const moduleFooter = row.querySelector('tfoot');
                    if (moduleFooter) {
                        const moduleIdSpan = moduleFooter.querySelector('td table tbody tr td:nth-child(3) span.couleurTetx');
                        module.id = moduleIdSpan ? moduleIdSpan.textContent.trim() : '';

                        const footerSpans = moduleFooter.querySelectorAll('td span.couleurTetx1');
                        module.moyenModule = footerSpans[1]?.textContent.trim() || '';
                        module.decisionModule = footerSpans[2]?.textContent.trim() || '';
                    }

                    row.querySelectorAll('tbody tr').forEach(tr => {
                        const spans = tr.querySelectorAll('td span.couleurTetx1');
                        if (spans.length >= 8) {
                            const matiere = {
                                name: spans[0].textContent.trim(),
                                credit: parseFloat(spans[1].textContent.replace(",", ".")) || 0,
                                noteTP: parseFloat(spans[2].textContent.replace(",", ".")) || 0,
                                noteCC: parseFloat(spans[3].textContent.replace(",", ".")) || 0,
                                noteFinalCheck: parseFloat(spans[4].textContent.replace(",", ".")) || 0,
                                noteCatchup: parseFloat(spans[5].textContent.replace(",", ".")) || 0,
                                noteFinal: parseFloat(spans[6].textContent.replace(",", ".")) || 0,
                                decision: spans[7].textContent.trim()
                            };
                            if (matiere.name && matiere.decision) {
                                module.matieres.push(matiere);
                            }
                        }
                    });

                    if (module.id || module.matieres.length > 0) {
                        modules.push(module);
                    }
                });

                return { modules, modulesInfo };
            });

            if (parsedNotes.modules.length > 0) {
                semesterNotes[semester] = parsedNotes;
            }
        }

        console.log('Semesters processed:', Object.keys(semesterNotes));
        return semesterNotes;
    } catch (error) {
        console.error('Error in getStudentNote:', error);
        return {};
    }
};

// Process individual student data
const processStudent = async (id, browser) => {
    const page = await browser.newPage();

    try {
        console.log(`Starting to process student ID C${id}`);
        
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            if (['image', 'stylesheet', 'font'].includes(req.resourceType())) {
                req.abort();
            } else {
                req.continue();
            }
        });

        console.log(`Navigating to ${FST_URL}`);
        await page.goto(FST_URL, { waitUntil: 'networkidle2', timeout: 60000 });
        await page.setViewport({ width: 1080, height: 1024 });

        console.log('Waiting for input field');
        await page.waitForSelector("input[type='text'].rsinputTetx", { timeout: 30000 });
        await page.$eval("input[type='text'].rsinputTetx", el => el.value = "");
        await page.type("input[type='text'].rsinputTetx", `C${id}`);
        
        console.log('Submitting student ID');
        await Promise.all([
            page.keyboard.press("Enter"),
            page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 })
        ]);

        console.log('Parsing student info');
        const html = await page.content();
        const studentInfo = parseStudentInfo(html);

        if (!studentInfo) {
            console.log(`Student with ID C${id} not found.`);
            return null;
        }

        console.log(`Processing student ID C${id}`);
        const semesterNotes = await getStudentNote(page);

        return {
            id: `C${id}`,
            Name: studentInfo.Name,
            "Profil d'orientation": studentInfo["Profil d'orientation"],
            Profil: studentInfo.Profil,
            semesters: semesterNotes
        };
    } catch (error) {
        console.error(`Error processing student ID C${id}:`, error);
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
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--dns-prefetch-disable' , '--no-zygote'],
        executablePath: process.env.NODE_ENV === 'production' ? process.env.PUPPETEER_EXECUTABLE_PATH : puppeteer.executablePath(),
        defaultViewport: null,
    });

    try {
        const studentDetails = await processStudent(studentId, browser);

        if (!studentDetails) {
            console.error(`Unable to retrieve data for student ID C${studentId}`);
            return null;
        }

        return studentDetails;
    } finally {
        await browser.close();
    }
};


module.exports = { getStudentNotes };