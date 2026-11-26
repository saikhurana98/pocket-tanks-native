// Install inside a browser page before its first sound is loaded.
module.exports = function recordSounds() {
  window.played = [];
  window.decoded = [];
  window.mediaRequests = [];
  const context = window.AudioContext?.prototype;
  if (context && window.AudioBufferSourceNode) {
    const names = new WeakMap(), buffers = new WeakMap();
    const bytes = Response.prototype.arrayBuffer;
    Response.prototype.arrayBuffer = async function() {
      const data = await bytes.call(this);
      names.set(data,this.url.split("/").pop());
      return data;
    };
    const decode = context.decodeAudioData;
    context.decodeAudioData = async function(data) {
      const buffer = await decode.call(this,data);
      buffers.set(buffer,names.get(data));
      window.decoded.push(names.get(data));
      return buffer;
    };
    const source = AudioBufferSourceNode.prototype, start = source.start;
    source.start = function(...args) {
      const result = start.apply(this,args);
      window.played.push(buffers.get(this.buffer));
      return result;
    };
  }
  const play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function(...args) {
    const result = play.apply(this,args);
    if (this.src.endsWith(".wav")) {
      const name=this.src.split("/").pop();
      window.mediaRequests.push(name);
      result.then(()=>window.played.push(name),()=>{});
    }
    return result;
  };
};
