var canvas = require('canvas-api-wrapper'),
    dsv = require('d3-dsv'),
    pMap = require('p-map'),
    chalk = require('chalk'),
    fs = require('fs');

function printPretty(obj) {
    console.log(JSON.stringify(obj, null, 4));
}

var subAccounts = [
    {
        name: `pathwayScaled`,
        id: 110
    },
    {
        name: `onlineScaled`,
        id: 44
    }
],
    terms = [{
        name: "Fall 2019",
        id: 89
    }];

function fixCode(code) {
    return code.toLowerCase().replace(/\s/g, '');
}

var tempCourseCode = {
    "AGBUS 105": "AGBPC 105",
    "BUS 115": "BUSPC 115",
    "CS 101": "CSPC 101",
    "FAML 160": "FAMPC 160",
    "FAML 498R": "",
    "SI 250": "",
    "HTMBC 110": "HTMPC 110",
    "REL 261": "RELPC 261",
    "SMMBC 105": "SMMPC 105",
    "TESOL 101": "TESPC 101",
    // "WDD 100": "WDDPC 100"
}
badCourseCodes = Object.keys(tempCourseCode).map(fixCode);

async function getGroupCategories(courseId) {
    function sortOnName(a, b) {
        if (a.name === b.name) {
            return 0;
        } else if (a.name > b.name) {
            return 1;
        }
        return -1;
    }

    try {
        var groupCats = await canvas.get(`/api/v1/courses/${courseId}/group_categories`);
        groupCats = groupCats
            .sort(sortOnName)
            .map(cat => ({
                id: cat.id,
                name: cat.name
            }));


        // get the groups 
        for (let i = 0; i < groupCats.length; i++) {
            const cat = groupCats[i];
            let groups = await canvas.get(`api/v1/group_categories/${cat.id}/groups`);
            cat.groups = groups.map(group => group.name).sort();
        }


        return groupCats.map(cat => {
            return `|||${cat.name} || ${cat.groups.join('|')}`
        }).join(' ');
    } catch (error) {
        console.error(chalk.red(error));
        return `could not get groups for ${courseId}`;
    }
}

function semesterBlueprintSIStoMasterSIS(BpSIS) {

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
    if (courseCode === "FAML 498R") {
        return "FAML 498R.Internship-Project.None.None.Master";
    }
    if(BpSIS === "SI 250.Gathering.2019.Fall.Blueprint"){
        return "SI 250.--.None.None.Master";
    }
    try{
        // remove the number from the block if it has one
        block = block.replace(/\d/g, '');
    }catch(error){
        console.error(error);
        console.log(chalk.yellow(BpSIS));
    }

    var localTempCourseCode = tempCourseCode[courseCode];
    if (localTempCourseCode !== undefined) {
        courseCode = localTempCourseCode;
    }
    // send it back
    // had to hard code Block For the summer courses
    // return [courseCode, init, none, "Block", "Master"].join('.');
    return [courseCode, init, none, block, "Master"].join('.');
    // FAML 110.Initiative.None.None.Master
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

    course.groupCategories = await getGroupCategories(course.id);
    var semesterBlueprint = await getSemesterBlueprint(course.id);

    if (semesterBlueprint !== undefined) {
        course.semesterBpSISId = semesterBlueprint.sis_course_id;
        course.semesterBpCourseId = semesterBlueprint.id;
        course.parentGroupCategories = await getGroupCategories(semesterBlueprint.id);
        // are the blueprint and the section the same?
        course.sameGroupsSemester = course.parentGroupCategories === course.groupCategories;
        // get the mater course id
        try {

            course.masterSISId = semesterBlueprintSIStoMasterSIS(course.semesterBpSISId);
        } catch (error) {
            console.error(error);
        }
        // get the groups from the masterCourse
        course.masterGroupsCategories = await getGroupCategories(`sis_course_id:${course.masterSISId}`);
        // are the Master and the section the same?
        course.sameGroupsMaster = course.masterGroupsCategories === course.groupCategories;
    } else {
        printPretty(semesterBlueprint);
        course.parentGroupCategories = "Doesn't have a blue print";
    }
    return course;
}


function makeFileName(terms, subAccounts) {
    var termNames = terms.map(term => term.name.replace(/ /g, '')).join('.'),
        subAccountNames = subAccounts.map(subAccount => subAccount.name.replace(/ /g, '')).join('.');
    return `${termNames}+${subAccountNames}+GroupReport_${Date.now()}.csv`
}

 async function getCourses(){
    var term,
    courses = [];

    for (let j = 0; j < terms.length; j++) {
        term = terms[j];
        for (let i = 0; i < subAccounts.length; i++) {
            const subAccount = subAccounts[i];
            let coursesI = await canvas.get(`/api/v1/accounts/${subAccount.id}/courses?sort=sis_course_id&order=asc&search_by=course&include%5B%5D=subaccount&enrollment_term_id=${term.id}&include[]=term`)
            courses = courses.concat(coursesI);
        }
    }
    printPretty(courses[0]);
   return courses
            .filter(course => {
                return terms.some(term => term.id === course.term.id);
            })
            .filter(course => {
                return subAccounts.some(subAccount => subAccount.id === course.account_id);
            });
}

async function getCoursesCSV(){
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
    
    async function getCourseFromSection(courseIn){
        var section =  await canvas.get(`/api/v1/sections/sis_section_id:${courseIn.sisID}`);
        return  await canvas.get(`/api/v1/courses/${section.course_id}?include%5B%5D=subaccount&include[]=term`);
    }
    
    var courses = await getCSV(`./tempList.csv`);
    
    courses = await pMap(courses,getCourseFromSection,{concurrency: 10});
    return courses;

}

async function main() {
    try {
        var term,
            courses = [];



        //get all the courses we need
        // pretty(pathwayCourses[0]);
        //filter for winter term

        
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
            concurrency: 10
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