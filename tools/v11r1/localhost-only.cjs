// Test-process network boundary. Inherited by Node children via NODE_OPTIONS.
// No credentials, project calls or telemetry may leave localhost.
const net=require('node:net'),dns=require('node:dns'),dgram=require('node:dgram');
const local=host=>['127.0.0.1','::1','localhost','[::1]'].includes(String(host||'localhost'));
const reject=host=>{throw Object.assign(new Error('TEST_NETWORK_DENIED: non-local destination '+String(host)),{code:'TEST_NETWORK_DENIED'})};
const connect=net.Socket.prototype.connect;
net.Socket.prototype.connect=function(...args){const [options]=net._normalizeArgs(args);if(!options.path&&!local(options.host))reject(options.host);return connect.apply(this,args)};
for(const name of ['lookup','resolve','resolve4','resolve6','resolveAny','resolveCname','resolveMx','resolveNaptr','resolveNs','resolvePtr','resolveSoa','resolveSrv','resolveTxt','reverse'])if(dns[name]){const original=dns[name];dns[name]=function(host,...args){if(!local(host))reject(host);return original.call(this,host,...args)}}
const lookup=dns.promises.lookup;dns.promises.lookup=async(host,...args)=>{if(!local(host))reject(host);return lookup.call(dns.promises,host,...args)};
dgram.Socket.prototype.send=function(){reject('UDP disabled for local Emulator tests')};
