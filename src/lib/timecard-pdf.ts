"use client";

import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";

type EmployeeReport={
  employee_id:number;
  employee_name:string;
  employee_cpf:string;
  admission_date:string;
  totals:{
    worked_minutes:number;
    positive_minutes:number;
    negative_minutes:number;
    balance_minutes:number;
  };
  rows:Array<any>;
};

type MonthlyReport={
  month:string;
  employee_reports:EmployeeReport[];
};

const fmt=(n:number|null|undefined)=>{
  if(n==null)return "-";
  const a=Math.abs(n);
  return `${String(Math.floor(a/60)).padStart(2,"0")}h${String(a%60).padStart(2,"0")}`;
};

const fmtSigned=(n:number|null|undefined)=>{
  if(n==null)return "-";
  const sign=n>0?"+":n<0?"-":"";
  return `${sign}${fmt(n)}`;
};

const formatDate=(value:string|null|undefined)=>{
  if(!value)return "-";
  const m=String(value).slice(0,10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m?`${m[3]}/${m[2]}/${m[1]}`:String(value);
};

const formatMonth=(value:string)=>{
  const m=value.match(/^(\d{4})-(\d{2})$/);
  return m?`${m[2]}/${m[1]}`:value;
};

const formatCpf=(value:string)=>{
  const d=String(value||"").replace(/\D/g,"");
  return d.length===11?`${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`:value||"-";
};

const intervalText=(r:any)=>{
  if(r.intervalo_inicio&&r.intervalo_fim)return `${String(r.intervalo_inicio).slice(0,5)} - ${String(r.intervalo_fim).slice(0,5)}`;
  return "-";
};

const clean=(value:unknown)=>String(value??"")
  .replace(/[–—]/g,"-")
  .replace(/\s+/g," ")
  .trim();

const fileSafe=(value:string)=>value
  .toLowerCase()
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g,"")
  .replace(/[^a-z0-9]+/g,"-")
  .replace(/^-|-$/g,"");

export function downloadTimecardPdf(report:MonthlyReport){
  if(!report?.employee_reports?.length)throw new Error("Cartão ponto sem dados.");
  if(report.employee_reports.length!==1)throw new Error("Selecione somente um funcionário para baixar o cartão ponto.");

  const employee=report.employee_reports[0];
  const cardRows=employee.rows
    .filter((r:any)=>
      Number(r.worked_minutes)>0
      || Number(r.daily_balance_minutes)!==0
      || r.occurrence_type==="FOLGA"
    )
    .sort((a:any,b:any)=>String(a.date).localeCompare(String(b.date)));

  if(!cardRows.length)throw new Error("Não há registros ou movimentações de banco nesta competência.");

  const totalWorked=cardRows.reduce((sum:number,r:any)=>sum+Number(r.worked_minutes||0),0);
  const doc=new jsPDF({orientation:"portrait",unit:"mm",format:"a4",compress:true});
  const pageWidth=doc.internal.pageSize.getWidth();
  const pageHeight=doc.internal.pageSize.getHeight();

  // Identidade institucional simples, sem imagem de logo.
  doc.setFillColor(240,122,26);
  doc.roundedRect(12,11,15,15,2,2,"F");
  doc.setTextColor(255,255,255);
  doc.setFont("helvetica","bold");
  doc.setFontSize(8.5);
  doc.text("CVT",19.5,20.5,{align:"center"});

  doc.setTextColor(25,32,38);
  doc.setFont("helvetica","bold");
  doc.setFontSize(11);
  doc.text("Corrente da Vida Treinamentos",32,15.5);
  doc.setFont("helvetica","normal");
  doc.setFontSize(7.2);
  doc.setTextColor(104,113,121);
  doc.text("Cartao Ponto Mensal",32,21);

  doc.setFont("helvetica","bold");
  doc.setFontSize(9);
  doc.setTextColor(25,32,38);
  doc.text(formatMonth(report.month),pageWidth-12,16,{align:"right"});
  doc.setFont("helvetica","normal");
  doc.setFontSize(6.5);
  doc.setTextColor(104,113,121);
  doc.text("Competencia",pageWidth-12,21,{align:"right"});

  doc.setDrawColor(48,56,63);
  doc.setLineWidth(.35);
  doc.line(12,31,pageWidth-12,31);

  // Dados do funcionário.
  doc.setTextColor(104,113,121);
  doc.setFontSize(6.4);
  doc.text("Funcionario",12,36);
  doc.text("CPF",112,36);
  doc.text("Admissao",162,36);

  doc.setTextColor(25,32,38);
  doc.setFont("helvetica","bold");
  doc.setFontSize(8.2);
  doc.text(clean(employee.employee_name),12,41);
  doc.text(formatCpf(employee.employee_cpf),112,41);
  doc.text(formatDate(employee.admission_date),162,41);

  const fontSize=cardRows.length>=28?5.8:cardRows.length>=24?6.2:6.7;
  const padding=cardRows.length>=28?.75:cardRows.length>=24?.9:1.1;

  const body=cardRows.map((r:any)=>[
    formatDate(r.date),
    clean(r.weekday),
    r.entrada?String(r.entrada).slice(0,5):"-",
    intervalText(r),
    r.saida?String(r.saida).slice(0,5):"-",
    fmt(Number(r.worked_minutes)),
    fmtSigned(Number(r.daily_balance_minutes||0)),
    clean(r.status||""),
  ]);

  autoTable(doc,{
    startY:47,
    head:[["Data","Dia","Entrada","Intervalo","Saida","Horas","Banco","Situacao"]],
    body,
    theme:"grid",
    pageBreak:"avoid",
    rowPageBreak:"avoid",
    margin:{left:12,right:12,bottom:46},
    styles:{
      font:"helvetica",
      fontSize,
      cellPadding:padding,
      lineColor:[220,224,228],
      lineWidth:.15,
      textColor:[42,50,57],
      valign:"middle",
      halign:"center",
      overflow:"linebreak",
    },
    headStyles:{
      fillColor:[242,244,246],
      textColor:[55,64,72],
      fontStyle:"bold",
      fontSize,
      cellPadding:1.2,
      lineColor:[205,211,216],
    },
    columnStyles:{
      0:{cellWidth:22},
      1:{cellWidth:17},
      2:{cellWidth:22},
      3:{cellWidth:32},
      4:{cellWidth:22},
      5:{cellWidth:24,fontStyle:"bold"},
      6:{cellWidth:27,fontStyle:"bold"},
      7:{cellWidth:33,fontStyle:"bold"},
    },
    didParseCell:(data:any)=>{
      if(data.section==="body"&&data.row.index%2===1){
        data.cell.styles.fillColor=[250,251,252];
      }
      if(data.section==="body"){
        const row=cardRows[data.row.index];
        const bank=Number(row?.daily_balance_minutes||0);
        if(data.column.index===6){
          if(bank>0)data.cell.styles.textColor=[47,112,71];
          if(bank<0)data.cell.styles.textColor=[153,55,55];
          if(bank===0)data.cell.styles.textColor=[70,82,92];
        }
        if(data.column.index===7){
          if(row?.occurrence_type==="FOLGA")data.cell.styles.textColor=[105,86,45];
          else if(bank>0)data.cell.styles.textColor=[47,112,71];
          else if(bank<0)data.cell.styles.textColor=[153,55,55];
        }
      }
    },
  });

  if(doc.getNumberOfPages()>1){
    throw new Error("O cartão ponto excedeu uma página. Reduza os registros da competência ou revise o layout.");
  }

  const finalY=(doc as any).lastAutoTable?.finalY??185;
  const summaryY=Math.min(Math.max(finalY+6,205),235);

  const gap=3;
  const boxW=(pageWidth-24-gap*3)/4;
  const summaryItems=[
    {label:"TRABALHADAS",value:fmt(totalWorked),kind:"neutral"},
    {label:"POSITIVAS",value:fmt(employee.totals.positive_minutes),kind:"positive"},
    {label:"NEGATIVAS",value:fmt(employee.totals.negative_minutes),kind:"negative"},
    {label:"SALDO",value:fmtSigned(employee.totals.balance_minutes),kind:Number(employee.totals.balance_minutes)>0?"positive":Number(employee.totals.balance_minutes)<0?"negative":"neutral"},
  ];

  summaryItems.forEach((item,i)=>{
    const x=12+i*(boxW+gap);
    if(item.kind==="positive")doc.setFillColor(242,249,244);
    else if(item.kind==="negative")doc.setFillColor(253,244,244);
    else doc.setFillColor(248,249,250);

    doc.setDrawColor(220,224,228);
    doc.roundedRect(x,summaryY,boxW,13,2,2,"FD");
    doc.setTextColor(104,113,121);
    doc.setFont("helvetica","normal");
    doc.setFontSize(5.8);
    doc.text(item.label,x+3,summaryY+4.5);

    if(item.kind==="positive")doc.setTextColor(47,112,71);
    else if(item.kind==="negative")doc.setTextColor(153,55,55);
    else doc.setTextColor(25,32,38);

    doc.setFont("helvetica","bold");
    doc.setFontSize(8.4);
    doc.text(item.value,x+boxW-3,summaryY+8.5,{align:"right"});
  });

  // Assinatura fixa no rodapé para manter uma única folha.
  const signatureY=265;
  doc.setTextColor(104,113,121);
  doc.setFont("helvetica","normal");
  doc.setFontSize(6.4);
  doc.text("Declaro que conferi os registros deste cartao ponto mensal.",pageWidth/2,signatureY-9,{align:"center"});

  const employeeX=58;
  const rhX=152;

  doc.setDrawColor(55,63,70);
  doc.setLineWidth(.3);
  doc.line(employeeX-34,signatureY,employeeX+34,signatureY);
  doc.line(rhX-34,signatureY,rhX+34,signatureY);

  doc.setTextColor(25,32,38);
  doc.setFont("helvetica","bold");
  doc.setFontSize(7);
  doc.text(clean(employee.employee_name),employeeX,signatureY+4,{align:"center"});
  doc.text("Andre Celestino",rhX,signatureY+4,{align:"center"});

  doc.setTextColor(104,113,121);
  doc.setFont("helvetica","normal");
  doc.setFontSize(6.2);
  doc.text("Assinatura do funcionario",employeeX,signatureY+8,{align:"center"});
  doc.text("Coordenador RH",rhX,signatureY+8,{align:"center"});

  doc.setDrawColor(226,229,232);
  doc.line(12,pageHeight-10,pageWidth-12,pageHeight-10);
  doc.setFontSize(5.8);
  doc.setTextColor(120,127,133);
  doc.text("Corrente da Vida Treinamentos - CVT",12,pageHeight-6);
  doc.text("Cartao ponto para conferencia e assinatura",pageWidth-12,pageHeight-6,{align:"right"});

  doc.save(`cartao-ponto-${fileSafe(employee.employee_name)}-${report.month}.pdf`);
}
