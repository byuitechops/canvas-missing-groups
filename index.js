var canvas = require('canvas-api-wrapper'),
    dsv = require('d3-dsv'),
    pMap = require('p-map'),
    chalk = require('chalk'),
    fs = require('fs'),
    color;

function colorLog(text, color) {
    console.log(chalk.hsl(color, 100, 50)(text));
}

function printPretty(obj) {
    console.log(JSON.stringify(obj, null, 4));
}

var subAccounts = [
    {
        name: `pathwayScaled`,
        id: 110
    }
    ,
    {
        name: `onlineScaled`,
        id: 44
    }
],
    terms = [{
        name: "Spring20",
        id: 95
    }];

function fixCode(code) {
    return code.toLowerCase().replace(/\s/g, '');
}


var tempCourseCode = [
    ["AGBUS 105", "AGBPC 105"],
    ["AUTO 125", "AUTPC 125"],
    ["BUS 115", "BUSPC 115"],
    ["CONST 221", "CONPC 221"],
    ["CS 101", "CSPC 101"],
    ["FAML 160", "FAMPC 160"],
    ["HS 240", "HSPC 240"],
    ["HTMBC 110", "HTMPC 110"],
    ["REL 261", "RELPC 261"],
    ["TESOL 101", "TESPC 101"],
    ["WDD 130", "WDDPC 130"],
    ["SMMBC 105", "SMMPC 105"]
];
//badCourseCodes = Object.keys(tempCourseCode).map(fixCode);

async function getGroupCategories(courseId) {
    function sortOnName(a, b) {
        if (a.name === b.name) {
            return 0;
        } else if (a.name > b.name) {
            return 1;
        }
        return -1;
    }


    var groupCats = await canvas.get(`/api/v1/courses/${courseId}/group_categories`);
    groupCats = groupCats
        .sort(sortOnName)
        .map(cat => ({
            id: cat.id,
            name: cat.name,
            selfSignUp: cat.self_signup === null ? "off" : "on",
            groupLimit: cat.group_limit === null ? "off" : cat.group_limit,
            autoLeader: cat.auto_leader === null ? "off" : cat.auto_leader
        }));


    // get the groups 
    for (let i = 0; i < groupCats.length; i++) {
        const cat = groupCats[i];
        let groups = await canvas.get(`api/v1/group_categories/${cat.id}/groups`);
        cat.groups = groups.map(group => group.name).sort();
    }


    return groupCats.map(cat => {
        return `|||${cat.name}-SU:${cat.selfSignUp}-GL:${cat.groupLimit}-AL:${cat.autoLeader} || ${cat.groups.join('|')}`
    }).join(' ');
}

function getLocalCode(courseCode) {
    var set = tempCourseCode.find(set => set.includes(courseCode));
    if (set) {
        var index = set.indexOf(courseCode);
        var courseCodeOut;
        if (index === 1)
            courseCodeOut = set[0];
        else {
            courseCodeOut = set[1];
        }
        return courseCodeOut;
    }

    return undefined;
}


async function semesterBlueprintSIStoMasterSIS(BpSIS) {
    var color = Math.floor(Math.random() * 360);
    // remove 
    //    2019
    //    spring
    //    number from block ()
    // Replac e
    // 	Blueprint with Master

    // FAML 120.Initiative.None.2019.Spring.Block1.Blueprint
    // FAML 120.Initiative.None.Block.Master

    // PSYCH 302.Initiative.None.2019.Spring.None.Blueprint
    // PSYCH 302.Initiative.None.None.Master (no Ccv) 

    // semester blueprint
    // BA 211.Initiative.None.2019.Summer.None.Blueprint
    //    BA 211.Initiative.None.2019.Summer.None.Blueprint
    // master
    // BA 211.Initiative.None.Block.Master
    //    BA 211.Initiative.None.Block.Master
    var [courseCode, init, none, year, semester, block, blueprint] = BpSIS.split('.');

    // if (BpSIS === "SI 250.Gathering.2019.Fall.Blueprint") {
    //     return "SI 250.--.None.None.Master";
    // }
    if (courseCode === "FAML 498R") {
        //the code is set to this "FAML 498R.Internship/Project.None.None.Master" i change it and run it and then set it back
        return "FAML%20498R.Internship%2FProject.None.None.Master";
    }
    try {
        // remove the number from the block if it has one
        block = block.replace(/\d/g, '');
    } catch (error) {
        console.error(error);
        console.log(chalk.yellow(BpSIS));
    }

    function getsisOut(courseCode, init, none, block) {
        return [courseCode, init, none, block, "Master"].join('.')
    };

    var codeOut = getsisOut(courseCode, init, none, block);
    // send it back
    // had to hard code Block For the summer courses
    // return [courseCode, init, none, "Block", "Master"].join('.');
    if (courseCode === "" || codeOut === "" || codeOut.includes('/')) {
        
        throw new Error("Invalid MasterSISId: " + codeOut)
    }

    try {
        //colorLog(`trying:${codeOut}`, color);
        await canvas.get(`api/v1/courses/sis_course_id:${codeOut}`);
        return codeOut;
    } catch (error) {
    
        //colorLog(`that didn't work`, color);

        var localTempCourseCode = getLocalCode(courseCode);
        if (localTempCourseCode !== undefined) {
            courseCode = localTempCourseCode;
            var codeOut = getsisOut(courseCode, init, none, block);
            // colorLog(`trying different:${codeOut}`, color);
            return codeOut;
        }
        else {

            console.log(chalk.red(`neither worked throwing`));
            throw new Error("Invalid MasterSISId: " + codeOut)
        }
    }
}


async function getSemesterBlueprint(courseId) {
    var blueprintSub = await canvas.get(`/api/v1/courses/${courseId}/blueprint_subscriptions`);
    blueprintSub = blueprintSub[0];

    // console.log( blueprintSub.blueprint_course);
    if (blueprintSub !== undefined) {
        return blueprintSub.blueprint_course;
    } else {
        return undefined;
    }
}

function makePercentComplete(lengthIn) {
    var length = lengthIn,
        count = 0;

    return function () {
        count += 1;
        return `${(count / length * 100).toFixed(2)}%`;
    }
}
var groupDataPercent;
async function getGroupData(course, i) {
    console.log(`${i} ${groupDataPercent()} ${course.sis}`);

    // get the section course groups
    try {
        course.groupCategories = await getGroupCategories(course.id);
    } catch (error) {
        console.error(chalk.red(error));
        course.Error = true;
        course.groupCategories = `Could not get groups for ${course.id}`;
    }

    var semesterBlueprint = await getSemesterBlueprint(course.id);

    if (semesterBlueprint === undefined) {
        course.parentGroupCategories = "Doesn't have a blue print";
        course.Error = true;
        return course;
    }

    // record these
    course.semesterBpSISId = semesterBlueprint.sis_course_id;
    course.semesterBpCourseId = semesterBlueprint.id;

    // get the groups for sememster blueprint
    try {
        course.parentGroupCategories = await getGroupCategories(semesterBlueprint.id);
    } catch (error) {
        console.error(chalk.red(error));
        course.Error = true;
        course.parentGroupCategories = `Could not get groups for ${semesterBlueprint.id}`;
    }

    // are the blueprint and the section the same?
    course.BlueprintAndSectionMatch = course.parentGroupCategories === course.groupCategories;

    // get the mater course id
    try {
        course.masterSISId = await semesterBlueprintSIStoMasterSIS(course.semesterBpSISId);
    } catch (error) {
        course.masterSISId = error.message;
        course.Error = true;
        console.error(chalk.red(error));
    }

    // get the groups from the masterCourse
    try {
        course.masterGroupsCategories = await getGroupCategories(`sis_course_id:${course.masterSISId}`);
    } catch (error) {
        console.error(chalk.red(error));
        course.Error = true;
        course.masterGroupsCategories = `could not get groups for ${course.masterSISId}`;
    }

    try {
        var masterCourse = await canvas.get(`/api/v1/courses/sis_course_id:${course.masterSISId}`);
        course.masterCourseId = masterCourse.id;
    } catch (error) {
        course.Error = true;
        course.masterCourseId = `could not get masterCourseid for ${course.masterSISId}`;
    }

    // are the Master and the section the same?
    course.MasterAndBlueprintMatch = course.masterGroupsCategories === course.parentGroupCategories;
    course.MasterAndSectionMatch = course.masterGroupsCategories === course.groupCategories;

    return course;
}


function makeFileName(terms, subAccounts) {
    var termNames = terms.map(term => term.name.replace(/ /g, '')).join('.'),
        subAccountNames = subAccounts.map(subAccount => subAccount.name.replace(/ /g, '')).join('.');
    return `${termNames}+${subAccountNames}+GroupReport_${Date.now()}.csv`
}

async function getCourses(onlyThisSubAccount) {
    console.log("getting courses from Canvas");
    var term,
        courses = [];
    canvas.oncall = function (e) {
        console.log(e)
    }
    for (let j = 0; j < terms.length; j++) {
        term = terms[j];
        console.log(`getting courses for ${term.name}`);
        for (let i = 0; i < subAccounts.length; i++) {
            const subAccount = subAccounts[i];
            console.log(`\tgetting courses for ${subAccount.name}`);
            let coursesI = await canvas.get(`/api/v1/accounts/${subAccount.id}/courses?sort=sis_course_id&order=asc&search_by=course&include%5B%5D=subaccount&enrollment_term_id=${term.id}&include[]=term&per_page=100`)
            courses = courses.concat(coursesI);
        }
    }
    canvas.oncall = function () { };
    console.log("done getting courses");
    printPretty(courses[0]);
    courses = courses
        .filter(course => {
            return terms.some(term => term.id === course.term.id);
        });

    if (onlyThisSubAccount) {
        courses = courses.filter(course => {
            return subAccounts.some(subAccount => subAccount.id === course.account_id);
        });
    }

    return courses;
}

async function getCoursesCSV() {
    console.log("getting courses from CSV");

    async function getCSV(courseCsvFile) {
        const stripBOM = require('strip-bom');
        const dsv = require('d3-dsv');
        const path = require('path');
        const fs = require('fs');
        //resolve the path the user puts in
        courseCsvFile = path.resolve(courseCsvFile);
        //read it in and remove the potential BOM and then parse with DSV 
        var csvCourseData = dsv.csvParse(stripBOM(fs.readFileSync(courseCsvFile, 'utf8')));
        return csvCourseData;
    }

    async function getCourseFromSection(courseIn) {
        var section = await canvas.get(`/api/v1/sections/sis_section_id:${courseIn.sisID}`);
        return await canvas.get(`/api/v1/courses/${section.course_id}?include%5B%5D=subaccount&include[]=term`);
    }

    var courses = await getCSV(`./last.csv`);

    courses = await pMap(courses, getCourseFromSection, { concurrency: 10 });
    return courses;

}

async function getCoursesFromBlueprints() {
    var blueprints = [
        "BUS 100.Initiative.None.2020.Winter.Block2.Blueprint",
        "COMM 289.Initiative.None.2020.Winter.Block2.Blueprint",
        "FAML 110.Initiative.None.2020.Winter.Block2.Blueprint",
        "FAML 120.Initiative.None.2020.Winter.Block2.Blueprint",
        "FAML 150.Initiative.None.2020.Winter.Block2.Blueprint",
        "INTST 100.Initiative.None.2020.Winter.Block2.Blueprint",
        "LR 111.Initiative.None.2020.Winter.Block2.Blueprint",
        "PSYCH 112.Initiative.None.2020.Winter.Block2.Blueprint",
        "REL 130.Initiative.None.2020.Winter.Block2.Blueprint",
        "REL 211.Init 3.None.2020.Winter.Block2.Blueprint ",
        "REL 212.Init 3.None.2020.Winter.Block2.Blueprint"
    ];

    async function getChildCourses(sisCourseId) {
        var childCourses = await canvas.get(`api/v1/courses/sis_course_id:${sisCourseId}/blueprint_templates/default/associated_courses`);
        return childCourses.map(course => course.sis_course_id);
    }

    async function sisCourseIdToCourseObj(sisCourseId) {
        return await canvas.get(`/api/v1/courses/sis_course_id:${sisCourseId}?include%5B%5D=subaccount&include[]=term`);
    }

    // get all the kids in parallel
    var kids = await pMap(blueprints, getChildCourses);
    //flatten the array
    kids = kids.reduce((arr, kid) => arr.concat(kid), []);

    printPretty(kids);
    // get the real course obj
    kids = await pMap(kids, sisCourseIdToCourseObj);
    return kids;
}

async function main() {
    try {
        var term,
            courses = [];



        //get all the courses we need
        // pretty(pathwayCourses[0]);
        //filter for winter term
        // courses = await getCourses(false);
        // courses = await getCoursesFromBlueprints();
        courses = await getCoursesCSV();
        printPretty(courses[0]);

        courses = courses
            .map(course => ({
                name: course.name,
                id: course.id,
                sis: course.sis_course_id,
                term: course.term.name,
                start: course.start_at,
                end: course.end_at,
                code: fixCode(course.course_code)
            }))
            // .filter(course => !badCourseCodes.includes(course.code))
            // .filter(course => badCourseCodes.includes(course.code))
            // .filter(course => course.code === "si250")
            // .filter(course => course.code.includes("cit"))
            // .filter(course => course.sis === "Online.2019.Fall.CIT 261.thayneti@byui.edu.6")
            .sort((a, b) => {
                if (a.sis < b.sis) {
                    return -1;
                } else if (a.sis > b.sis) {
                    return 1;
                }
                return 0;
            });
        printPretty(courses[0]);
        // courses = courses.slice(0, 5);
        console.log(courses.length);

        // //loop them to get their group data
        // for (let i = 0; i < courses.length; i++) {
        //     const course = courses[i];
        //     await getGroupData(i, course, courses);
        // }
        // set up the counter
        groupDataPercent = makePercentComplete(courses.length);

        //loop them to get their group data
        courses = await pMap(courses, getGroupData, {
            concurrency: 20
        });

        var fileName = makeFileName(terms, subAccounts);

        //make report
        fs.writeFileSync(fileName, dsv.csvFormat(courses), 'utf8');
        console.log(`Wrote ${fileName}`);

    } catch (error) {
        console.error(chalk.red(error.stack));
    }
}

main();