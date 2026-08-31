"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type {
  ClassRow,
  SectionRow,
  RoomRow,
  SubjectRow,
  TeacherRow,
  TeacherSubjectRow,
} from "@/lib/types";
import { ClassesTab } from "./classes-tab";
import { SectionsTab } from "./sections-tab";
import { RoomsTab } from "./rooms-tab";
import { SubjectsTab } from "./subjects-tab";
import { TeachersTab } from "./teachers-tab";
import { AdminsTab } from "./admins-tab";

interface MasterDataTabsProps {
  classes: ClassRow[];
  sections: SectionRow[];
  rooms: RoomRow[];
  subjects: SubjectRow[];
  teachers: TeacherRow[];
  teacherSubjects: TeacherSubjectRow[];
  admins: Array<{ id: string; username: string; role: "super" | "admin"; created_at: string }>;
}

export function MasterDataTabs(props: MasterDataTabsProps) {
  return (
    <Tabs defaultValue="classes">
      <TabsList className="flex flex-wrap h-auto">
        <TabsTrigger value="classes">Classes</TabsTrigger>
        <TabsTrigger value="sections">Sections</TabsTrigger>
        <TabsTrigger value="rooms">Rooms</TabsTrigger>
        <TabsTrigger value="subjects">Subjects</TabsTrigger>
        <TabsTrigger value="teachers">Teachers</TabsTrigger>
        <TabsTrigger value="admins">Admins</TabsTrigger>
      </TabsList>

      <TabsContent value="classes">
        <ClassesTab classes={props.classes} />
      </TabsContent>
      <TabsContent value="sections">
        <SectionsTab
          sections={props.sections}
          classes={props.classes}
          rooms={props.rooms}
        />
      </TabsContent>
      <TabsContent value="rooms">
        <RoomsTab rooms={props.rooms} />
      </TabsContent>
      <TabsContent value="subjects">
        <SubjectsTab subjects={props.subjects} />
      </TabsContent>
      <TabsContent value="teachers">
        <TeachersTab
          teachers={props.teachers}
          subjects={props.subjects}
          teacherSubjects={props.teacherSubjects}
        />
      </TabsContent>
      <TabsContent value="admins">
        <AdminsTab admins={props.admins} />
      </TabsContent>
    </Tabs>
  );
}
