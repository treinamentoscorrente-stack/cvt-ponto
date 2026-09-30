"use client";

import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";

type Totals={
  worked_minutes:number;
  positive_minutes:number;
  negative_minutes:number;
  balance_minutes:number;
};

type EmployeeReport={
  employee_name:string;
  employee_cpf:string;
  admission_date:string;
  totals:Totals;
  rows:Array<any>;
};

type MonthlyReport={
  month:string;
  employee_reports:EmployeeReport[];
};

const fmt=(n:number|null|undefined,s=false)=>{
  if(n==null)return "-";
  const sign=n<0?"-":s&&n>0?"+":"";
  const a=Math.abs(n);
  return `${sign}${String(Math.floor(a/60)).padStart(2,"0")}h${String(a%60).padStart(2,"0")}`;
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
  return d.length===11?`${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`:value;
};

const intervalText=(r:any)=>{
  if(r.intervalo_inicio&&r.intervalo_fim)return `${String(r.intervalo_inicio).slice(0,5)} - ${String(r.intervalo_fim).slice(0,5)}`;
  if(r.intervalo_inicio)return `${String(r.intervalo_inicio).slice(0,5)} - ?`;
  if(r.intervalo_fim)return `? - ${String(r.intervalo_fim).slice(0,5)}`;
  return "-";
};

const clean=(value:unknown)=>String(value??"")
  .replace(/[–—]/g,"-")
  .replace(/•/g,"/")
  .replace(/\s+/g," ")
  .trim();

const filename=(report:MonthlyReport)=>{
  const base=report.employee_reports.length===1?report.employee_reports[0].employee_name:"todos-funcionarios";
  return `espelho-ponto-${base.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")}-${report.month}.pdf`;
};

function drawHeader(doc:jsPDF,employee:EmployeeReport,month:string){
  const pageWidth=doc.internal.pageSize.getWidth();

  doc.setFillColor(240,122,26);
  doc.roundedRect(10,10,17,17,2,2,"F");
  doc.setTextColor(255,255,255);
  doc.setFont("helvetica","bold");
  doc.setFontSize(9);
  doc.text("CVT",18.5,20.5,{align:"center"});

  doc.setTextColor(24,32,40);
  doc.setFontSize(11);
  doc.text("Corrente da Vida Treinamentos",32,15);
  doc.setFont("helvetica","normal");
  doc.setFontSize(7.5);
  doc.setTextColor(105,117,128);
  doc.text("Espelho Mensal de Ponto - Conferencia do Funcionario",32,21);

  doc.setFont("helvetica","bold");
  doc.setFontSize(9);
  doc.setTextColor(24,32,40);
  doc.text(formatMonth(month),pageWidth-10,16,{align:"right"});
  doc.setFont("helvetica","normal");
  doc.setFontSize(6.5);
  doc.setTextColor(105,117,128);
  doc.text("Competencia",pageWidth-10,21,{align:"right"});

  doc.setDrawColor(45,55,64);
  doc.setLineWidth(.4);
  doc.line(10,31,pageWidth-10,31);

  doc.setTextColor(105,117,128);
  doc.setFontSize(6.5);
  doc.text("Funcionario",10,36);
  doc.text("CPF",122,36);
  doc.text("Admissao",191,36);

  doc.setTextColor(24,32,40);
  doc.setFont("helvetica","bold");
  doc.setFontSize(8.5);
  doc.text(clean(employee.employee_name),10,41);
  doc.text(formatCpf(employee.employee_cpf),122,41);
  doc.text(formatDate(employee.admission_date),191,41);

  const cards=[
    ["Trabalhadas",fmt(employee.totals.worked_minutes)],
    ["Positivas",fmt(employee.totals.positive_minutes)],
    ["Negativas",fmt(employee.totals.negative_minutes)],
    ["Saldo",fmt(employee.totals.balance_minutes,true)],
  ];
  const cardY=46;
  const cardW=(pageWidth-20-9)/4;
  cards.forEach(([label,value],i)=>{
    const x=10+i*(cardW+3);
    doc.setFillColor(248,249,250);
    doc.setDrawColor(223,228,232);
    doc.roundedRect(x,cardY,cardW,12,1.5,1.5,"FD");
    doc.setTextColor(105,117,128);
    doc.setFont("helvetica","normal");
    doc.setFontSize(6);
    doc.text(label,x+3,cardY+4);
    doc.setTextColor(24,32,40);
    doc.setFont("helvetica","bold");
    doc.setFontSize(8);
    doc.text(value,x+3,cardY+9);
  });
}

function drawSignature(doc:jsPDF,employee:EmployeeReport,y:number){
  const pageHeight=doc.internal.pageSize.getHeight();
  const pageWidth=doc.internal.pageSize.getWidth();
  let top=y+10;
  if(top>pageHeight-25){
    doc.addPage();
    top=25;
  }

  doc.setFont("helvetica","normal");
  doc.setTextColor(105,117,128);
  doc.setFontSize(6.7);
  doc.text("Declaro que conferi os registros de jornada e os saldos apresentados neste relatorio mensal.",pageWidth/2,top,{align:"center"});

  const lineY=top+11;
  doc.setDrawColor(60,70,78);
  doc.setLineWidth(.3);
  doc.line(pageWidth/2-52,lineY,pageWidth/2+52,lineY);

  doc.setTextColor(24,32,40);
  doc.setFont("helvetica","bold");
  doc.setFontSize(7.3);
  doc.text(clean(employee.employee_name),pageWidth/2,lineY+4,{align:"center"});
  doc.setTextColor(105,117,128);
  doc.setFont("helvetica","normal");
  doc.setFontSize(6.3);
  doc.text("Assinatura do funcionario",pageWidth/2,lineY+8,{align:"center"});
}

function drawFooter(doc:jsPDF){
  const pageWidth=doc.internal.pageSize.getWidth();
  const pageHeight=doc.internal.pageSize.getHeight();
  doc.setDrawColor(225,228,231);
  doc.line(10,pageHeight-7,pageWidth-10,pageHeight-7);
  doc.setFont("helvetica","normal");
  doc.setFontSize(5.8);
  doc.setTextColor(120,128,135);
  doc.text("Corrente da Vida Treinamentos - CVT",10,pageHeight-3.5);
  doc.text("Documento para conferencia mensal do funcionario",pageWidth-10,pageHeight-3.5,{align:"right"});
}

export function downloadMonthlyReportPdf(report:MonthlyReport){
  if(!report?.employee_reports?.length)throw new Error("Relatorio sem dados para gerar PDF.");

  const doc=new jsPDF({orientation:"landscape",unit:"mm",format:"a4",compress:true});

  report.employee_reports.forEach((employee,index)=>{
    if(index>0)doc.addPage();

    drawHeader(doc,employee,report.month);

    const rows=employee.rows.map((r:any)=>[
      formatDate(r.date),
      clean(r.weekday),
      r.entrada?String(r.entrada).slice(0,5):"-",
      intervalText(r),
      r.saida?String(r.saida).slice(0,5):"-",
      fmt(r.worked_minutes),
      r.bank_debit_minutes?fmt(r.bank_debit_minutes):"-",
      fmt(r.daily_balance_minutes,true),
      clean(r.status),
      clean(r.details||""),
    ]);

    autoTable(doc,{
      startY:62,
      head:[["Data","Dia","Entrada","Intervalo","Saida","Trabalhado","Debito","Saldo dia","Situacao","Observacao"]],
      body:rows,
      theme:"grid",
      margin:{left:10,right:10,bottom:13},
      styles:{
        font:"helvetica",
        fontSize:6.2,
        cellPadding:1.6,
        lineColor:[224,228,232],
        lineWidth:.15,
        textColor:[45,55,64],
        valign:"middle",
        overflow:"linebreak",
      },
      headStyles:{
        fillColor:[242,244,246],
        textColor:[62,72,80],
        fontStyle:"bold",
        lineColor:[210,216,221],
        fontSize:6,
      },
      columnStyles:{
        0:{cellWidth:18},
        1:{cellWidth:10},
        2:{cellWidth:16},
        3:{cellWidth:28},
        4:{cellWidth:16},
        5:{cellWidth:20},
        6:{cellWidth:18},
        7:{cellWidth:20},
        8:{cellWidth:32},
        9:{cellWidth:78},
      },
      didParseCell:(data:any)=>{
        if(data.section!=="body")return;
        const row=employee.rows[data.row.index];
        const balance=Number(row?.daily_balance_minutes);
        let fill:[number,number,number]|undefined;
        let accent:[number,number,number]|undefined;

        if(Number.isFinite(balance)&&balance<0){
          fill=[253,244,244];
          accent=[153,55,55];
        }else if(Number.isFinite(balance)&&balance>0){
          fill=[242,249,244];
          accent=[47,112,71];
        }else if(String(row?.status||"").includes("CUMPRIDA")){
          fill=[243,247,252];
          accent=[55,92,132];
        }

        if(fill)data.cell.styles.fillColor=fill;
        if(accent&&(data.column.index===7||data.column.index===8)){
          data.cell.styles.textColor=accent;
          data.cell.styles.fontStyle="bold";
        }
        if(String(row?.status||"")==="FIM DE SEMANA"){
          data.cell.styles.fillColor=[249,250,251];
          data.cell.styles.textColor=[118,126,133];
        }
      },
      didDrawPage:()=>drawFooter(doc),
    });

    const finalY=(doc as any).lastAutoTable?.finalY??145;
    drawSignature(doc,employee,finalY);
    drawFooter(doc);
  });

  doc.save(filename(report));
}
