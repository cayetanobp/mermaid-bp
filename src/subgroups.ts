import type {Flow,FlowGroup} from './flow';
export function groupPath(flow:Flow,id:string):string {
  const groups=flow.groups ?? [],parts:string[]=[],seen=new Set<string>();
  let current=groups.find(g=>g.id===id);
  while(current&&!seen.has(current.id)){parts.unshift(current.id);seen.add(current.id);current=groups.find(g=>g.id===current!.parent);}
  return parts.join('/');
}
export function assignGroup(flow:Flow,nodeId:string,id:string) {
  const node=flow.nodes.find(n=>n.id===nodeId);if(!node)return;
  const path=id?groupPath(flow,id):'';
  if(path)node.group=path;else delete node.group;
}
function rebase(flow:Flow) {
  for(const node of flow.nodes)if(node.group)assignGroup(flow,node.id,node.group.split('/').at(-1)!);
}
export function saveGroup(flow:Flow,group:FlowGroup) {
  const groups=flow.groups ??= [];
  if(flow.nodes.some(n=>n.id===group.id)||!/^[A-Za-z_][\w]*$/.test(group.id))throw Error('Identificador de subgrupo no válido.');
  const old=groups.find(g=>g.id===group.id);
  if(group.parent&&(!groups.some(g=>g.id===group.parent)||groupPath(flow,group.parent).split('/').includes(group.id)))throw Error('Un subgrupo no puede contenerse a sí mismo.');
  if(old)Object.assign(old,{...group,parent:group.parent||undefined});else groups.push({...group});
  rebase(flow);
}
export function deleteGroup(flow:Flow,id:string) {
  const group=flow.groups?.find(g=>g.id===id);if(!group)return;
  for(const node of flow.nodes)if(node.group?.split('/').at(-1)===id) {
    if(group.parent)node.group=group.parent;else delete node.group;
  }
  for(const child of flow.groups ?? [])if(child.parent===id)child.parent=group.parent;
  flow.groups=flow.groups!.filter(g=>g.id!==id);rebase(flow);
}
