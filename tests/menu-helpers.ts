import {type Page} from '@playwright/test';
/** Acceso real a un comando, también cuando ahora se encuentra en un desplegable. */
export async function command(page:Page,id:string){
 const target=page.locator('#'+id);const menu=await target.evaluate(el=>el.closest('[role="menu"]')?.getAttribute('aria-labelledby'));
 if(menu&&!await target.isVisible())await page.locator('#'+menu).click();
 await target.click();
}
