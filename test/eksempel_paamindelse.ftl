<#-- @ftlvariable name="data" type="com.dantek.dl.api.notification.datamodel.ReturnDateExceededReminderDataModel" -->
<#assign erBarn = false />
<#list (data.loaner.loanerGroups)![] as g><#if g.loanerGroupName?starts_with("Børn")><#assign erBarn = true /></#if></#list>
Påmindelse: <#if data.materialLoans?size == 1>dit lån skal snart afleveres<#else>dine lån skal snart afleveres</#if>
Kære ${(data.loaner.name)!"låner"}

<#if data.materialLoans?size == 1>
Afleveringsfristen for dette lån nærmer sig:
<#else>
Afleveringsfristen for disse ${(data.materialLoans?size)!0} lån nærmer sig:
</#if>

<#list data.materialLoans as lån>
- ${(lån.record.title)!""}<#if (lån.record.author)?has_content> af ${(lån.record.author)!""}</#if>
  Afleveres senest ${(lån.loan.returnDate?date?string["dd.MM.yyyy"])!""}

</#list>
<#if !erBarn>
Hvis materialerne ikke afleveres eller fornyes til tiden, skal du betale gebyr.

</#if>
Du kan forny dine lån på bibliotekets hjemmeside.

Med venlig hilsen
${(data.agency.name)!""}
