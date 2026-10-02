import { endianness } from 'node:os';
const little=endianness()==='LE';
export function encodeMessage(message) {const payload=Buffer.from(JSON.stringify(message));if(payload.length>1000000)throw new Error('Message too large');const header=Buffer.alloc(4);header[little?'writeUInt32LE':'writeUInt32BE'](payload.length);return Buffer.concat([header,payload]);}
export class FrameDecoder {
  constructor(onMessage){this.buffer=Buffer.alloc(0);this.onMessage=onMessage;}
  push(chunk){this.buffer=Buffer.concat([this.buffer,chunk]);while(this.buffer.length>=4){const length=this.buffer[little?'readUInt32LE':'readUInt32BE'](0);if(length>1000000 || length===0)throw new Error('Invalid frame');if(this.buffer.length<length+4)return;const message=JSON.parse(this.buffer.subarray(4,4+length).toString('utf8'));this.buffer=this.buffer.subarray(4+length);this.onMessage(message);}}
}
