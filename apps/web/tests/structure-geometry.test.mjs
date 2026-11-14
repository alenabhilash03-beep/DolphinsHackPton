import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { STRUCTURES, parseCoordinates, parseResidueLabel, residueKey, interfaceContacts, residueContacts, separation } from '../lib/structure-geometry.ts';
const read=(id)=>readFileSync(new URL(`../public/structures/${id}.pdb`,import.meta.url));
const atom=(changes={})=>({serial:1,chain:'A',resi:1,icode:'',resn:'GLY',atom:'CA',element:'C',protein:true,x:0,y:0,z:0,...changes});

test('official assets keep their audited hashes and entity counts',()=>{
  for(const [kind,count] of [['trastuzumab',7890],['imatinib',4710]]) {
    const profile=STRUCTURES[kind],bytes=read(profile.id),model=parseCoordinates(bytes.toString());
    assert.equal(createHash('sha256').update(bytes).digest('hex'),profile.sha256);
    assert.equal(model.atoms.length,count);
    if(kind==='imatinib')for(const chain of ['A','B'])assert.equal(model.atoms.filter(a=>a.chain===chain&&a.resn==='STI').length,37);
  }
});
test('real closest interfaces agree with deposited-coordinate reference pairs',()=>{
  for(const [kind,count,expected,left,right] of [
    ['trastuzumab',32,2.4169871741488387,'B:103:GLY','C:593:LYS'],
    ['imatinib',45,2.668499578414803,'A:201:STI','A:360:ILE'],
  ]) {
    const model=parseCoordinates(read(STRUCTURES[kind].id).toString()),pairs=interfaceContacts(model.atoms,kind);
    assert.equal(pairs.length,count);assert(Math.abs(pairs[0].distance-expected)<1e-12);
    assert.equal(residueKey(pairs[0].a),left);assert.equal(residueKey(pairs[0].b),right);
    const neighbors=residueContacts(model.atoms,pairs[0].a,kind);
    assert.equal(neighbors[0].distance,pairs[0].distance);
    assert(pairs.every(pair=>pair.distance<=4));
  }
});
test('bucket search and residue minima agree with independent brute force at cutoff boundaries',()=>{
  const atoms=[atom({x:-4,serial:1}),atom({x:-2,serial:2,atom:'N'}),atom({x:2,chain:'C',serial:3,resi:2}),atom({x:3,chain:'C',serial:4,resi:3}),atom({x:100,chain:'C',serial:5,resi:4})];
  const expected=[];
  for(const a of atoms.filter(a=>a.chain==='A'))for(const b of atoms.filter(a=>a.chain==='C')){
    const distance=Math.sqrt((a.x-b.x)**2+(a.y-b.y)**2+(a.z-b.z)**2);
    if(distance<=4)expected.push({a,b,distance});
  }
  const actual=interfaceContacts(atoms,'trastuzumab');
  assert.deepEqual(actual,expected);
  const nearest=residueContacts(atoms,atoms[0],'trastuzumab');
  assert.equal(nearest[0].distance,4);assert.equal(nearest[0].a.serial,2);
  assert.throws(()=>interfaceContacts(atoms,'trastuzumab',0));
});
test('waters, glycans and contacts between distinct crystal copies are excluded',()=>{
  const atoms=[atom(),atom({serial:2,chain:'B',resi:201,resn:'STI',protein:false,x:.1}),atom({serial:3,resn:'HOH',protein:false,x:.1}),atom({serial:4,resn:'NAG',protein:false,x:.1})];
  assert.equal(interfaceContacts(atoms,'imatinib').length,0);
  assert.equal(interfaceContacts(atoms,'trastuzumab').length,0);
});
test('reported unresolved residues stay unresolved; author insertion codes are preserved',()=>{
  const model=parseCoordinates(read('1N8Z').toString());
  assert(model.unresolved.some(r=>r.chain==='C'&&r.resi===102&&r.resn==='ASN'));
  assert(!model.atoms.some(a=>a.chain==='C'&&a.resi===102));
  assert.deepEqual(parseResidueLabel('100A'),{resi:100,icode:'A'});
  assert.deepEqual(parseResidueLabel('-2'),{resi:-2,icode:''});
  assert.throws(()=>parseResidueLabel('100 and 101'));
});
test('ambiguous conformers and invalid coordinates fail instead of synthesizing atoms',()=>{
  const line=read('1N8Z').toString().split('\n').find(l=>l.startsWith('ATOM  '));
  assert.throws(()=>parseCoordinates(line.slice(0,16)+'A'+line.slice(17)),/conformers/);
  assert.throws(()=>parseCoordinates(line.slice(0,30)+'        '+line.slice(38)),/coordinate/);
  assert.throws(()=>parseCoordinates(line+'\n'+line),/identifiers/);
  const first=parseCoordinates('MODEL        1\n'+line+'\nENDMDL\nMODEL        2\n'+line+'\nENDMDL');
  assert.equal(first.atoms.length,1);
});
test('distance inspection never mutates coordinate arrays',()=>{
  const model=parseCoordinates(read('1IEP').toString());
  const before=JSON.stringify(model.atoms);
  Object.freeze(model.atoms);model.atoms.forEach(Object.freeze);
  const pairs=interfaceContacts(model.atoms,'imatinib');residueContacts(model.atoms,pairs[0].a,'imatinib');
  assert.equal(JSON.stringify(model.atoms),before);
  assert.equal(separation(atom(),atom({x:3,y:4})),5);
});
