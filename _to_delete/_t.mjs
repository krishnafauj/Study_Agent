import { sectionOfTopic, tierOfTopic, TIER } from "./services/accessPolicyService.js";
const secs=[{_id:"a",title:"topic 1",pageStart:1,pageEnd:5,tier:"locked"},{_id:"b",title:"topic 2",pageStart:6,pageEnd:10,tier:"locked"},{_id:"c",title:"dp",pageStart:11,pageEnd:15,tier:"full"}];
const acc={isOwner:false,sections:secs,byId:new Map(secs.map(s=>[s._id,s]))};
console.log(tierOfTopic({sectionId:"c"},acc), tierOfTopic({sectionId:"b"},acc), tierOfTopic({pageStart:12,pageEnd:13},acc), tierOfTopic({},acc), tierOfTopic({}, {...acc,isOwner:true}));
