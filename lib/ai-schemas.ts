const string={type:'string',minLength:1};
const object=(properties:Record<string,unknown>)=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
export const summarySchema=object({summary:string});
export const chatSchema=object({answer:string,citations:{type:'array',items:object({noteId:string,quote:string})}});
export const studySchema=(count:number)=>object({
 cards:{type:'array',minItems:count,maxItems:count,items:object({front:string,back:string,quote:string})},
 questions:{type:'array',minItems:count,maxItems:count,items:object({prompt:string,options:{type:'array',minItems:4,maxItems:4,items:string},answer:{type:'integer',minimum:0,maximum:3},explanations:{type:'array',minItems:4,maxItems:4,items:string},quote:string})},
});
