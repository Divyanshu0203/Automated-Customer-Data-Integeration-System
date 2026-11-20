import type { DatasetInput } from "./types";

/** Small demo data: messy on purpose, with duplicates spread across sources. */
export const SAMPLE_DATASETS: DatasetInput[] = [
  {
    name: "crm.csv",
    content: `Customer Name,Email Address,Mobile,Company,City,Country,Signup Date
priya sharma,Priya.Sharma@Example.com,+91 98765 43210,Acme Corp,gurugram,India,15/03/2024
Rahul VERMA,rahul.verma@example.com,098765 11111,Globex,Mumbai,India,2024-04-02
John Smith,john.smith@example.com,+1 (415) 555-0132,Initech,San Francisco,USA,2023-11-20
Anita Desai,anita.desai@example,9988776655,Umbrella,Pune,India,01/05/2024
Mei Chen,mei.chen@example.com,,Hooli,Singapore,Singapore,2024-01-09
`,
  },
  {
    name: "orders.csv",
    content: `email,phone,order_date,amount
priya.sharma@example.com,,2024-05-01,"₹1,200.50"
,9876543210,2024-06-11,899
rahul.verma@example.com,,2024-05-20,2500
john.smith@example.com,,2024-01-15,$149.99
john.smith@example.com,,2024-03-02,$75.00
unknown@nowhere.test,,2024-07-01,300
,,2024-07-02,50
`,
  },
  {
    name: "feedback.json",
    content: JSON.stringify(
      [
        { email: "priya.sharma@example.com", feedback: "Great product! Support was very helpful." },
        { email: "rahul.verma@example.com", comment: "Not satisfied, delivery was late and the packaging was damaged." },
        { email: "john.smith@example.com", review: "Okay experience." },
        { phone: "9988776655", feedback: "Terrible app, constantly buggy and slow." },
        { email: "mei.chen@example.com", feedback: "Excellent service, would recommend!" },
      ],
      null,
      2,
    ),
  },
];