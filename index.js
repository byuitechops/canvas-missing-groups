var canvas = require('canvas-api-wrapper'),
    dsv = require('d3-dsv'),
    pMap = require('p-map'),
    fs = require('fs');

function printPretty(obj) {
    console.log(JSON.stringify(obj, null, 4));
}

var subAccounts = [{
    name: `pathwayScaled`,
    id: 110
},
{
    name: `onlineScaled`,
    id: 44
}
],
    // var term = ""
    terms = [{
        name: "Spring2019",
        id: 23
    }];


async function getGroupCategories(courseId) {
    function sortOnName(a, b) {
        if (a.name === b.name) {
            return 0;
        }
        return a.name > b.name;
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
        console.error(error);
        return `could not get groups for ${courseId}`;
    }
}

function semesterBlueprintSIStoMasterSIS(BpSIS) {
    // remove 
    //    2019
    //    spring
    //    number from block ()
    // Replace
    // 	Blueprint with Master

    // FAML 120.Initiative.None.2019.Spring.Block1.Blueprint
    // FAML 120.Initiative.None.Block.Master

    // PSYCH 302.Initiative.None.2019.Spring.None.Blueprint
    // PSYCH 302.Initiative.None.None.Master (no Ccv) 

    var [courseCode, init, none, year, semester, block, blueprint] = BpSIS.split('.');
    // remove the number from the block if it has one
    block = block.replace(/\d/, '');
    // send it back
    return [courseCode, init, none, block].join('.') + ".Master";
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
    console.log(i, course.sis, groupDataPercent());
    
    course.groupCategories = await getGroupCategories(course.id);
    var semesterBlueprint = await getSemesterBlueprint(course.id);
    
    if (semesterBlueprint !== undefined) {
        course.semesterBpSISId = semesterBlueprint.sis_course_id;
        course.semesterBpCourseId = semesterBlueprint.id;
        course.parentGroupCategories = await getGroupCategories(semesterBlueprint.id);
        // are the blueprint and the section the same?
        course.sameGroupsSemester = course.parentGroupCategories === course.groupCategories;
        // get the mater course id
        course.masterSISId = semesterBlueprintSIStoMasterSIS(course.semesterBpSISId);
        // get the groups from the masterCourse
        course.masterGroupsCategories = await getGroupCategories(`sis_course_id:${course.masterSISId}`);
        // are the Master and the section the same?
        course.sameGroupsMaster = course.masterGroupsCategories === course.groupCategories;
    }
    else {
        printPretty(semesterBlueprint);
        course.parentGroupCategories = "Doesn't have a blue print";
    }
    return course;
}




async function main() {
    try {
        var term = terms[0],
            courses = [];

        for (let i = 0; i < subAccounts.length; i++) {
            const subAccount = subAccounts[i];
            let coursesI = await canvas.get(`/api/v1/accounts/${subAccount.id}/courses?sort=sis_course_id&order=asc&search_by=course&include%5B%5D=subaccount&enrollment_term_id=${term.id}&include[]=term`)
            courses = courses.concat(coursesI);
        }

        //get all the courses we need
        // pretty(pathwayCourses[0]);
        //filter for winter term

        // pretty(courses[0]);
        var courses = courses
            .filter(course => course.term.id === term.id)
            .map(course => ({
                name: course.name,
                id: course.id,
                sis: course.sis_course_id,
                term: course.term.name,
                start: course.start_at,
                end: course.end_at
            }))
            .sort((a, b) => {
                if (a.sis < b.sis) {
                    return -1;
                } else if (a.sis > b.sis) {
                    return 1;
                }
                return 0;
            });
        // pretty(courses[0]);
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
        courses = await pMap(courses, getGroupData, { concurrency: 5 });

        var fileName = `${term.name}OnlineCoursesGroupReport_${Date.now()}.csv`;

        //make report
        fs.writeFileSync(fileName, dsv.csvFormat(courses), 'utf8');
        console.log(`Wrote ${fileName}`);

    } catch (error) {
        console.error(error);
    }
}

main();


